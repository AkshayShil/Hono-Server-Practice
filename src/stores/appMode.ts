import { ref } from 'vue'
export type AppMode = 'study' | 'gurukul'
export const appMode = ref<AppMode>('study')
