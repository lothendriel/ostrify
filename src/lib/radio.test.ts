import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRadioStation, radioSharePath } from './radio';

const id = 'd39ab442-6c34-4097-afd0-e298ac21e50c';

afterEach(() => vi.unstubAllGlobals());

describe('radio sharing', () => {
  it('builds a compact link only for a valid radio station', () => {
    expect(radioSharePath({ id: `radio-browser:${id}`, source: 'radio-browser' })).toBe(`/audio?radio=${id}`);
    expect(radioSharePath({ id: 'radio-browser:not-a-uuid', source: 'radio-browser' })).toBeUndefined();
    expect(radioSharePath({ id: `radio-browser:${id}`, source: 'wavlake' })).toBeUndefined();
  });

  it('resolves a compact link to a playable live station and preserves HLS', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      stationuuid: id, name: 'Nostalgie HQ', url_resolved: 'https://radio.example.org/live',
      favicon: 'https://radio.example.org/logo.png', country: 'France', state: '', hls: 1,
    }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const track = await fetchRadioStation(id, new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(track).toMatchObject({ id: `radio-browser:${id}`, source: 'radio-browser', title: 'Nostalgie HQ', url: 'https://radio.example.org/live', mimeType: 'application/vnd.apple.mpegurl' });
  });

  it('rejects invalid identifiers, mismatched directory results, and unsafe streams', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { stationuuid: id, name: 'Station', url_resolved: 'http://radio.example.org/live' },
    ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchRadioStation('../invalid', new AbortController().signal)).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await fetchRadioStation('12345678-1234-1234-1234-123456789abc', new AbortController().signal)).toBeUndefined();
    expect(await fetchRadioStation(id, new AbortController().signal)).toBeUndefined();
  });
});
