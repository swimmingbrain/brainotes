export const prerender = true;

// the notes only exist once there is a browser: pointer events, canvas and
// local storage live there, none of it survives prerendering
export const ssr = false;
