const maxSlicePxH = 850;
const elH = 2000;
const minFill = 450;

const elements = [
  { top: 100, bottom: 849 }, // Almost fits
  { top: 849, bottom: 900 }
];

const starts = [0];
let current = 0;
while (current < elH - 1) {
  const pageEnd = Math.min(current + maxSlicePxH, elH);
  let next = pageEnd;
  
  for (const b of elements) {
    // If it crosses the pageEnd (or is within 10px of the edge)
    if (b.top < pageEnd && b.bottom > pageEnd - 10) {
      if (b.top >= current + minFill) {
        next = b.top; // Break EXACTLY at the top edge
        break;
      }
    }
  }
  
  if (next === pageEnd) {
    for (const b of elements) {
      if (b.top < pageEnd && b.bottom > pageEnd - 10 && b.top > current) {
        next = b.top;
        break;
      }
    }
  }
  
  if (next <= current) next = pageEnd;
  starts.push(next);
  current = next;
}
console.log("Starts:", starts);
