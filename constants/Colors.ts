/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#687076',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    primary: '#007AFF',
    success: '#34C759',
    error: '#FF3B30',
    warning: '#FF9500',
    card: '#FFFFFF',
    border: '#C6C6C8',
    white: '#FFFFFF',
    inputBackground: '#fff',
    cancelButtonBackground: '#687076',
  },
  dark: {
    text: '#ECEDEE',
    textSecondary: '#9BA1A6',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    primary: '#0A84FF',
    success: '#30D158',
    error: '#FF453A',
    warning: '#FF9F0A',
    card: '#2C2C2E',
    border: '#38383A',
    white: '#FFFFFF',
    inputBackground: '#151718',
    cancelButtonBackground: '#9BA1A6',
  },
};
