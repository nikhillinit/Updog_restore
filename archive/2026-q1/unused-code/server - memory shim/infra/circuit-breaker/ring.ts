export class Ring {
  private arr: number[];
  private idx = 0;
  private filled = false;
  constructor(private size: number) {
    this.arr = new Array(size).fill(0);
  }
  push(v: number) {
    this.arr[this.idx] = v;
    this.idx = (this.idx + 1) % this.size;
    if (this.idx === 0) this.filled = true;
  }
  values(): number[] {
    return this.filled ? [...this.arr] : this.arr.slice(0, this.idx);
  }
}
