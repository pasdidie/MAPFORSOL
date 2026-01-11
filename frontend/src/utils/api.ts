export async function fetchConfig() {
  const res = await fetch('/api/canvas/config');
  return res.json();
}

export async function fetchChunk(x: number, y: number): Promise<Uint8Array> {
  const res = await fetch(`/api/canvas/chunk/${x}/${y}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function placePixel(wallet: string, x: number, y: number, color: number) {
  const res = await fetch('/api/canvas/pixel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, x, y, color }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

export async function getUser(wallet: string) {
  const res = await fetch(`/api/user/${wallet}`);
  return res.json();
}

export async function getActiveShields() {
  const res = await fetch('/api/shield/active');
  return res.json();
}
