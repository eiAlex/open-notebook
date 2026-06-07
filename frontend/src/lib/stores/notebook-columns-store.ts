import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface NotebookColumnsState {
  sourcesCollapsed: boolean
  notesCollapsed: boolean
  mcpCollapsed: boolean
  toggleSources: () => void
  toggleNotes: () => void
  toggleMcp: () => void
  setSources: (collapsed: boolean) => void
  setNotes: (collapsed: boolean) => void
  setMcp: (collapsed: boolean) => void
}

export const useNotebookColumnsStore = create<NotebookColumnsState>()(
  persist(
    (set) => ({
      sourcesCollapsed: false,
      notesCollapsed: false,
      mcpCollapsed: false,
      toggleSources: () => set((state) => ({ sourcesCollapsed: !state.sourcesCollapsed })),
      toggleNotes: () => set((state) => ({ notesCollapsed: !state.notesCollapsed })),
      toggleMcp: () => set((state) => ({ mcpCollapsed: !state.mcpCollapsed })),
      setSources: (collapsed) => set({ sourcesCollapsed: collapsed }),
      setNotes: (collapsed) => set({ notesCollapsed: collapsed }),
      setMcp: (collapsed) => set({ mcpCollapsed: collapsed }),
    }),
    {
      name: 'notebook-columns-storage',
    }
  )
)
