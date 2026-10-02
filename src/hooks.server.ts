import type { Handle } from '@sveltejs/kit';

// the tags between <!-- app --> and <!-- /app --> in app.html are for the app
// at /. it is only drawn in the browser, so they have to be in the html
// already. every other page brings its own title and canonical link
export const handle: Handle = ({ event, resolve }) =>
  resolve(event, {
    transformPageChunk: ({ html }) =>
      event.url.pathname === '/' ? html : html.replace(/\s*<!-- app -->[\s\S]*?<!-- \/app -->/, '')
  });
