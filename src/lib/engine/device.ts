// android browsers put canvases on the screen with other gpu drivers and compositors
// than desktops do, and give them less memory. a phone asking for the desktop site
// still says linux on arm
const ua = typeof navigator === 'undefined' ? '' : (navigator.userAgent ?? '');
const platform = typeof navigator === 'undefined' ? '' : (navigator.platform ?? '');

export const ANDROID = /android/i.test(ua) || /linux (arm|aarch)/i.test(platform);
