import { Window } from 'happy-dom'

/** Node 22+ có localStorage thử nghiệm không đủ API — dùng happy-dom. */
const win = new Window({ url: 'https://so-tai-san.test/' })
const ls = win.localStorage

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: ls,
})

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: win,
})

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
})
