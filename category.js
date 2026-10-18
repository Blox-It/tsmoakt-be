// Preserve the previously shared query-string URLs after the move to static pages.
const routes = {burgers:'/hamburgers/', bbq:'/bbq/', paella:'/paella/', steak:'/steak/', tapas:'/tapasplanken/'};
const slug = new URLSearchParams(location.search).get('slug');
if (Object.hasOwn(routes, slug)) location.replace(routes[slug]);
