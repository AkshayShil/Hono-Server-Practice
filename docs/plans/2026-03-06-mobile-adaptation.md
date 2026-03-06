# Mobile-Ready UI Adaptation Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adapt the UI for mobile devices using DaisyUI drawer for swipeable history, while keeping the desktop 3-column grid intact.

**Architecture:** 
- Wrap `App.vue` main content in a DaisyUI `drawer drawer-end`.
- Use responsive Tailwind classes (`md:`) to toggle between the desktop grid and mobile single-pane view.
- Hide the `Queuepane` on mobile to save space.
- Implement a swipe-to-open mechanism for the right history panel on mobile.

**Tech Stack:** Vue 3, Tailwind CSS v4, DaisyUI v5.

---

### Task 1: Responsive Layout in App.vue

**Files:**
- Modify: `src/App.vue`

**Step 1: Implement DaisyUI Drawer wrapper**
Wrap the `<main>` and `<aside>` (history) in a drawer structure.
```vue
<div class="drawer drawer-end h-full">
    <input id="history-drawer" type="checkbox" class="drawer-toggle" />
    <div class="drawer-content flex flex-col overflow-hidden">
        <!-- Main Content (Grid) -->
    </div>
    <div class="drawer-side z-50">
        <label for="history-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
        <!-- History Sidebar for Mobile -->
    </div>
</div>
```

**Step 2: Apply responsive classes to grid columns**
- `Queuepane`: Add `hidden md:flex`.
- `StudyPane`: Ensure it handles `col-span-12 md:col-span-8`. (Wait, StudyPane has `col-span-8` inside its template, I'll move it to App.vue for better control).
- Desktop `aside`: Add `hidden md:flex`.

**Step 3: Add mobile-only history toggle**
Add a floating button or a small tab on the right edge that only shows on mobile to open the drawer.

**Step 4: Commit**
```bash
git add src/App.vue
git commit -m "feat: implement responsive drawer layout in App.vue"
```

---

### Task 2: Responsive Tweaks in StudyPane.vue

**Files:**
- Modify: `src/components/StudyPane.vue`

**Step 1: Adjust layout classes**
- Remove `col-span-8` from the `<section>` tag (it will be handled by `App.vue`).
- Change `px-16` to `px-6 md:px-16` to provide better spacing on mobile.
- Adjust `max-w-2xl` if needed for mobile.

**Step 2: Touch-friendly buttons**
- Ensure the "Analyze" and "Fetch Cards" buttons have adequate height and spacing for touch.

**Step 3: Commit**
```bash
git add src/components/StudyPane.vue
git commit -m "feat: adjust StudyPane padding and layout for mobile"
```

---

### Task 3: Swipe Gesture Support

**Files:**
- Modify: `src/App.vue`

**Step 1: Implement Swipe Detection**
Add a small transparent area on the right edge or a full-screen touch listener to detect right-to-left swipes to open the history drawer on mobile.

**Step 2: Commit**
```bash
git add src/App.vue
git commit -m "feat: add swipe-to-open gesture for mobile history"
```

---

### Task 4: Modifying SessionHistory for Drawer

**Files:**
- Modify: `src/components/SessionHistory.vue`

**Step 1: Ensure it fills drawer height**
- Verify the history list scrolls correctly within the DaisyUI drawer side panel.
- Add a "Close" button visible only in the mobile drawer if needed.

**Step 2: Commit**
```bash
git add src/components/SessionHistory.vue
git commit -m "feat: ensure SessionHistory fits mobile drawer"
```
