 
 
 
 
 
// Keeps two percentages within a hard 100% cap with stable rounding.
export function allocate100(a: number, b: number): [number, number] {
  const sum = a + b;
  if (sum <= 100) return [a, b];

  const scale = 100 / sum;

  let a2 = Math.floor(a * scale);
  let b2 = Math.floor(b * scale);
  const remainder = 100 - (a2 + b2);

  const fa = a * scale - a2;
  const fb = b * scale - b2;
  const order: Array<'a' | 'b'> = fa >= fb ? ['a', 'b'] : ['b', 'a'];

  for (let k = 0; k < remainder; k++) {
    if (order[k % order.length] === 'a') a2++;
    else b2++;
  }
  return [a2, b2];
}

