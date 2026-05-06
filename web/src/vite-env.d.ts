/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare module '*.svg?raw' {
  const content: string
  export default content
}

declare module '*.svg' {
  const src: string
  export default src
}
