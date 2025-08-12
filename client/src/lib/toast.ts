// client/src/lib/toast.ts
export function toast(message: string, type: 'success' | 'error' = 'success') {
  const existingToasts = document.querySelectorAll('.simple-toast').length;
  const div = document.createElement('div');
  div.className = `simple-toast fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 ${
    type === 'success' ? 'bg-green-500' : 'bg-red-500'
  } text-white transition-transform duration-300`;
  
  // Offset new toasts from existing ones
  div.style.transform = `translateY(${existingToasts * 60}px)`;

  div.textContent = message;
  document.body.appendChild(div);

  setTimeout(() => {
    div.style.transform = `translateX(150%)`; // Slide out
    setTimeout(() => div.remove(), 300);
  }, 3000);
}
