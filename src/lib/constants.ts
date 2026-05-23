export const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || 'nZQar50lMcyJprudBf8i'

export const MAPTILER_URL = `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`

export const MAPTILER_ATTRIBUTION = '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>'
