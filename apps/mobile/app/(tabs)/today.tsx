// The route. Expo Router does not treat a platform extension on a route
// file as a route at all: app/today.android.tsx produced no
// route and every navigation to it silently went nowhere. So the route is
// one file and the fork lives one level down, where Metro resolves
// Today.ios.tsx and Today.android.tsx by extension the way it does for
// any component.
export { default } from "../../components/screens/Today";
