# Monthly Analyzer

Next-gen personal finance dashboard built with React Native & Expo.

## Overview
Track income & expenses and drill down into daily details. Animated charts, category breakdown, and a slick flip between Expenses & Gains views – all running 100 % offline on SQLite.

## Features
- Monthly summary of income, expenses and net
- Interactive bar chart per-day; tap to see the transaction list and live filter by amount
- Pie chart summarising expenses by category
- One-tap switch between Expense and Gains dashboards
- Exclude categories on the fly
- Test-data generator for quick demos
- Light & Dark theme support
- Smooth animations via Reanimated 3

## Tech Stack
- **Expo** 53 / React Native 0.79
- **TypeScript** throughout
- **react-native-reanimated** 3
- **react-native-gifted-charts** for visualisations
- **Expo Router** for file-based navigation
- **expo-sqlite** for local data storage

## Getting Started
1. Install prerequisites: Node 18+, Git, and the Expo CLI
   ```bash
   npm install -g expo-cli
   ```
2. Clone & install dependencies
   ```bash
   git clone <repo-url>
   cd telegramAppOBS-new
   npm install            # or yarn
   ```
3. Launch the dev server
   ```bash
   npm start              # opens Expo DevTools
   ```
4. Run on your device or emulator from the DevTools UI.

### Useful Scripts
```bash
npm run android   # build & run on Android emulator/device
npm run ios       # build & run on iOS simulator/device
npm run web       # start the web target
npm run reset-project   # wipe demo code and start fresh
```

### Seeding Demo Data
Inside the **Monthly Analyzer** screen hit **Generate Test Data** to create realistic sample transactions for the selected month.

## Project Structure (top-level)
```
app/            Expo Router screens & navigation
components/     Shared UI widgets
constants/      Theme colours & static config
hooks/          Custom hooks (theme, utils)
lib/            Database helpers & models
assets/         Images & fonts
scripts/        Dev utilities
```

## Roadmap
- Cloud sync & multi-device support
- Budgets and spending alerts
- Enhanced category management UI
- Unit / integration tests

---
Maintained by the dev team – open an issue or PR if you have ideas.
