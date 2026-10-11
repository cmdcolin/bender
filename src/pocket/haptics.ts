/** A short tick under the finger, where the phone has a motor for it. */
export const buzz = () => {
  if ('vibrate' in navigator) navigator.vibrate(8)
}
