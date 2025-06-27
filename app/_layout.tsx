import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View } from 'react-native';
import { Colors } from '@/constants/Colors';

// Properly configure Reanimated to disable strict mode warnings
configureReanimatedLogger({
  level: ReanimatedLogLevel.error, // Only show errors, not warnings
  strict: false, // Disable strict mode
});

import { useColorScheme } from '@/hooks/useColorScheme';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Key used to store the selected purpose in AsyncStorage - must match the key in purpose-selector.tsx
const PURPOSE_STORAGE_KEY = '@app_usage_purpose';

// Custom hook to manage the initial route based on purpose selection
function useInitialRoute() {
  // Remove router and segments as we won't navigate from here
  const [isReady, setIsReady] = useState(false);
  const [initialRouteName, setInitialRouteName] = useState<string | null>(null);

  useEffect(() => {
    const checkPurpose = async () => {
      try {
        const purpose = await AsyncStorage.getItem(PURPOSE_STORAGE_KEY);
        if (purpose) {
          console.log('[Layout] Purpose already selected:', purpose);
          setInitialRouteName('(tabs)'); // Set initial route name for Stack
        } else {
          console.log('[Layout] Purpose not selected, showing selector.');
          setInitialRouteName('purpose-selector'); // Set initial route name for Stack
        }
      } catch (e) {
        console.error('[Layout] Failed to check purpose:', e);
        // Default to main app on error
        setInitialRouteName('(tabs)');
      } finally {
        setIsReady(true);
      }
    };

    checkPurpose();
  }, []);

  // Return the readiness state and the determined initial route name
  return { isReady, initialRouteName };
}

export default function RootLayout() {
  const colorScheme = useColorScheme() || 'dark';
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Use the custom hook to determine the initial route and readiness
  const { isReady: isInitialRouteReady, initialRouteName } = useInitialRoute();

  useEffect(() => {
    // Log font loading errors
    if (error) {
      console.error('[Layout] Font loading error:', error);
      // Optionally, set an error state and display a message
    }
  }, [error]);

  useEffect(() => {
    // Hide splash screen only when both fonts are loaded AND initial route is determined
    if (loaded && isInitialRouteReady) {
      SplashScreen.hideAsync();
      console.log('[Layout] Fonts loaded and initial route ready. Hiding splash screen.');
    }
  }, [loaded, isInitialRouteReady]);

  // Show loading indicator until fonts are loaded AND initial route check is complete
  if (!loaded || !isInitialRouteReady || !initialRouteName) {
    // Ensure initialRouteName is also ready before rendering Stack
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors[colorScheme].background }}>
        <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
      </View>
    );
  }

  console.log(`[Layout] Rendering main app structure with initial route: ${initialRouteName}`);
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Pass initialRouteName to the Stack navigator */}
        <Stack initialRouteName={initialRouteName}>
          {/* Define all possible screens here */}
          <Stack.Screen name="purpose-selector" options={{ headerShown: false, title: 'Select Purpose' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
          <Stack.Screen name="all-transactions" options={{ title: 'All Transactions' }} />
          <Stack.Screen name="manage-categories" options={{ title: 'Manage Categories', presentation: 'modal' }} />
          <Stack.Screen name="monthly-analyzer" options={{ title: 'Monthly Analyzer' }} />
        </Stack>
      </GestureHandlerRootView>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
