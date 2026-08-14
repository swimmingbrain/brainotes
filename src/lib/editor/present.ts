import { writable } from 'svelte/store';
import { addToast } from '$lib/stores/app';

export const presenting = writable(false);

// present is the browser's own fullscreen, escape leaves it like everywhere
export function togglePresent() {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {});
    return;
  }
  document.documentElement.requestFullscreen().catch(() => {
    addToast('This browser did not allow fullscreen', 'warning');
  });
}

export function watchFullscreen(): () => void {
  const onchange = () => presenting.set(document.fullscreenElement !== null);
  document.addEventListener('fullscreenchange', onchange);
  return () => document.removeEventListener('fullscreenchange', onchange);
}
