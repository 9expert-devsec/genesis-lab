/**
 * The training rooms shown on /about-us.
 *
 * NO SOURCE IN THE REPO OR THE DATABASE holds room names or seat counts, so
 * these come from the design draft (Figma 184:88) and still need the
 * business's confirmation. Photos: public/about-img/room/*.webp.
 */
export const TRAINING_ROOMS = Object.freeze([
  { key: 'jupiter', name: 'Jupiter room', seats: 40, image: '/about-img/room/jupiter.webp' },
  { key: 'saturn',  name: 'Saturn room',  seats: 30, image: '/about-img/room/saturn.webp' },
  { key: 'venus',   name: 'Venus room',   seats: 20, image: '/about-img/room/venus.webp' },
  { key: 'mars',    name: 'Mars room',    seats: 10, image: '/about-img/room/mars.webp' },
]);
