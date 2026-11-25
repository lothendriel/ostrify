import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestApp } from '@/test/TestApp';
import { classifyStreamPlayback } from '@/lib/sanitize';
import { TunestrPlayerProvider, useTunestrPlayer } from './TunestrPlayer';
import type { TunestrStream } from '@/hooks/useTunestrStreams';

const hls = vi.hoisted(() => ({ loadSource: vi.fn(), attachMedia: vi.fn(), destroy: vi.fn(), on: vi.fn(), configs: [] as unknown[], supported: true }));
vi.mock('hls.js', () => ({
  default: class MockHls {
    static isSupported = () => hls.supported;
    static Events = { ERROR: 'error' };
    loadSource = hls.loadSource;
    attachMedia = hls.attachMedia;
    destroy = hls.destroy;
    on = hls.on;
    constructor(config: unknown) { hls.configs.push(config); }
  },
}));

function stream(url: string): TunestrStream {
  return { id: url, title: 'Test stream', url, externalUrl: url, createdAt: 1, status: 'live', isLive: true, format: 'nip53',
    track: { id: url, title: 'Test stream', url, pubkey: '', kind: 'music', topics: [], createdAt: 1 } };
}

function OpenStream({ url }: { url: string }) {
  const { openStream } = useTunestrPlayer();
  return <button onClick={() => openStream(stream(url))}>Open stream</button>;
}

function renderPlayer(url: string) {
  return render(<TestApp><TunestrPlayerProvider><OpenStream url={url} /></TunestrPlayerProvider></TestApp>);
}

describe('TuneStr playback safety and HLS regression', () => {
  beforeEach(() => { vi.clearAllMocks(); hls.configs.length = 0; hls.supported = true; });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('classifies HTTPS HLS and direct video without allowing arbitrary iframe URLs', () => {
    const hlsUrl = 'https://api.streamroad.money/show/hls/live.m3u8?vt=token';
    expect(classifyStreamPlayback(hlsUrl)).toEqual({ type: 'hls', url: hlsUrl });
    expect(classifyStreamPlayback('https://example.com/video.MP4?token=abc').type).toBe('video');
    expect(classifyStreamPlayback('https://example.com/page?video=live.m3u8').type).toBe('unsupported');
    expect(classifyStreamPlayback('https://example.com/live.m3u8/redirect').type).toBe('unsupported');
    expect(classifyStreamPlayback('http://example.com/live.m3u8').type).toBe('unsupported');
    expect(classifyStreamPlayback('https://user:pass@example.com/live.m3u8').type).toBe('unsupported');
    expect(classifyStreamPlayback('javascript:alert(1)').type).toBe('unsupported');
    expect(classifyStreamPlayback('https://customer-x.cloudflarestream.com/0123456789abcdef0123456789abcdef/iframe').type).toBe('embed');
  });

  it('plays a StreamRoad HLS manifest in the video player and cleans up on close', async () => {
    const url = 'https://api.streamroad.money/show/hls/live.m3u8?vt=token';
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    renderPlayer(url);
    fireEvent.click(await screen.findByRole('button', { name: 'Open stream' }));
    await waitFor(() => expect(hls.loadSource).toHaveBeenCalledWith(url));
    expect(screen.getByLabelText('Test stream').tagName).toBe('VIDEO');
    expect(screen.queryByText('This source can’t be embedded safely')).not.toBeInTheDocument();
    const config = hls.configs[0] as { xhrSetup: (xhr: XMLHttpRequest, url: string) => void };
    const xhr = { abort: vi.fn(), open: vi.fn(), withCredentials: true };
    config.xhrSetup(xhr as unknown as XMLHttpRequest, 'http://unsafe.example/segment.ts');
    expect(xhr.abort).toHaveBeenCalled();
    expect(xhr.open).not.toHaveBeenCalled();
    config.xhrSetup(xhr as unknown as XMLHttpRequest, 'https://cdn.example/segment.ts');
    expect(xhr.open).toHaveBeenCalledWith('GET', 'https://cdn.example/segment.ts', true);
    expect(xhr.withCredentials).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Close player' }));
    expect(hls.destroy).toHaveBeenCalled();
  });

  it('uses native HLS when hls.js is unavailable and the browser supports it', async () => {
    hls.supported = false;
    const url = 'https://api.streamroad.money/show/hls/live.m3u8?vt=token';
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    renderPlayer(url);
    fireEvent.click(await screen.findByRole('button', { name: 'Open stream' }));
    await waitFor(() => expect(screen.getByLabelText('Test stream')).toHaveAttribute('src', url));
    expect(hls.loadSource).not.toHaveBeenCalled();
  });

  it('prefers hls.js when a browser also reports possible native HLS support', async () => {
    const url = 'https://api.streamroad.money/show/live.m3u8';
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    renderPlayer(url);
    fireEvent.click(await screen.findByRole('button', { name: 'Open stream' }));
    await waitFor(() => expect(hls.loadSource).toHaveBeenCalledWith(url));
  });

  it('renders direct HTTPS video in the player', async () => {
    const url = 'https://media.example/recording.mp4?token=abc';
    renderPlayer(url);
    fireEvent.click(await screen.findByRole('button', { name: 'Open stream' }));
    expect(screen.getByLabelText('Test stream')).toHaveAttribute('src', url);
    expect(hls.loadSource).not.toHaveBeenCalled();
  });

  it('keeps unrelated web pages out of iframes', async () => {
    renderPlayer('https://example.com/stream');
    fireEvent.click(await screen.findByRole('button', { name: 'Open stream' }));
    expect(screen.getByText('This source can’t be embedded safely')).toBeInTheDocument();
    expect(screen.queryByTitle('Test stream')).not.toBeInTheDocument();
  });
});
