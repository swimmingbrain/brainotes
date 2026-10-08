// android browsers put canvases on the screen with other gpu drivers and compositors
// than desktops do, and give them less memory. a phone asking for the desktop site
// still says linux on arm
const ua = typeof navigator === 'undefined' ? '' : (navigator.userAgent ?? '');
const platform = typeof navigator === 'undefined' ? '' : (navigator.platform ?? '');

export const ANDROID = /android/i.test(ua) || /linux (arm|aarch)/i.test(platform);
// phones and tablets, they get less canvas memory than a desktop
export const PHONE = ANDROID || /iphone|ipad|mobile/i.test(ua);
// device pixels per css pixel for the paper and the ink on a phone, the live pen line
// keeps the screen's own. on a 3.5 screen that is about half the memory
export const PHONE_DPR = 2.5;
