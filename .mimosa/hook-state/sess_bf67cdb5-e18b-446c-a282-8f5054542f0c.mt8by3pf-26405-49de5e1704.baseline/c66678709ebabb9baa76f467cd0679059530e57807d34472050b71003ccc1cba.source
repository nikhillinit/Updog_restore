 
 
 
 
 
// client/src/lib/toast.ts
export function toast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  const existingToasts = document.querySelectorAll('.simple-toast').length;
  const div = document.createElement('div');
  
  const bgColor =
    type === 'success' ? 'bg-success' : type === 'error' ? 'bg-error' : 'bg-presson-info';
  
  div.className = `simple-toast fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 ${bgColor} text-pov-white transition-transform duration-300`;
  
  // Offset new toasts from existing ones
  div.style.transform = `translateY(${existingToasts * 60}px)`;

  div.textContent = message;
  document.body.appendChild(div);

  setTimeout(() => {
    div.style.transform = `translateX(150%)`; // Slide out
    setTimeout(() => div.remove(), 300);
  }, 3000);
}

/**
 * Wrap a promise with toast notifications
 */
export async function withToast<T>(
  promise: Promise<T>,
  messages: {
    pending?: string;
    success?: string;
    error?: string | ((_err: Error) => string);
  } = {}
): Promise<T> {
  const {
    pending = 'Processing...',
    success = 'Success!',
    error = 'Something went wrong'
  } = messages;
  
  // Show pending toast
  if (pending) {
    toast(pending, 'info');
  }
  
  try {
    const result = await promise;
    if (success) {
      toast(success, 'success');
    }
    return result;
  } catch (err) {
    const errorMessage = typeof error === 'function' 
      ? error(err as Error)
      : error;
    toast(errorMessage, 'error');
    throw err;
  }
}
