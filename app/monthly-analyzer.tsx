import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  RefreshControl,
  Modal,
  Button,
  PanResponder,
  GestureResponderEvent,
  LayoutChangeEvent,
  InteractionManager,
  SectionList,
  Switch,
} from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSpring,
  Easing,
  withSequence,
  withDelay,
  useAnimatedGestureHandler,
  useDerivedValue,
  useAnimatedProps,
  runOnJS,
  useAnimatedReaction,
  withRepeat,
  interpolate,
  cancelAnimation,
} from 'react-native-reanimated';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BarChart, PieChart } from "react-native-gifted-charts";
import { PanGestureHandler, PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

import { 
  getAllTransactions, 
  getGainCategoryId, 
  Transaction,
  generateTestDataForMonth,
  getAllCategories,
  Category,
} from '@/lib/database'; // Add generateTestDataForMonth
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

// Helper to get month name
const getMonthName = (monthIndex: number) => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[monthIndex];
};

// Predefined color palette for chart slices
const PIE_CHART_COLORS = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
  '#83CEC3', '#F7A35C', '#90ED7D', '#7CB5EC', '#F15C80', '#E7E9ED'
];

// --- Helper Function for Y-Axis Rounding (New) ---
const roundUpToPrettyNumber = (value: number): number => {
  if (value <= 0) return 100; // Default max for empty/no positive data
  // Determine the order of magnitude
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  // Get the most significant digit
  const mostSignificantDigit = Math.floor(value / magnitude);

  // Determine a nice rounding step based on the most significant digit
  let step;
  if (mostSignificantDigit < 2) {
    step = magnitude / 5; // e.g., round up to nearest 20, 200, 2000
  } else if (mostSignificantDigit < 5) {
    step = magnitude / 2; // e.g., round up to nearest 50, 500, 5000
  } else {
    step = magnitude; // e.g., round up to nearest 100, 1000, 10000
  }

  // Ensure step is at least 10 for small values
  step = Math.max(10, step);

  // Round up to the nearest step
  return Math.ceil(value / step) * step;
};

// --- Constants ---
const CLONED_BAR_INITIAL_HEIGHT = 120;
const CLONED_BAR_INITIAL_WIDTH = 20; 
const CLONED_BAR_TARGET_WIDTH = 35; 
const CLONED_BAR_MAX_HEIGHT = 450; 

// --- Constants and Optimization ---
// Keep existing constants but add these for optimization
const DRAG_THROTTLE_MS = 32; // Reduce update frequency to 30fps for filtering
const USE_NATIVE_DRIVER = true; // Use native driver when possible

// Add this line near the top of the file with other constants
const TOUCH_UPDATE_THRESHOLD = 0.02; // Only update if value changes by 2%

// Add this variable near the other constants at the top
const LAST_FILTER_VALUE_REF = { current: 0 };

// Add new constants for optimization
const FILTER_THROTTLE_MS = 100; // Only filter transactions every 100ms

// Fix TypeScript interface for the MemoizedTransactionItem props
interface TransactionItemProps {
  transaction: Transaction;
  gainCategoryId: number | null;
  colorScheme: 'light' | 'dark';
  styles: any; // StyleSheet type
  index: number; // Add index for staggered animations
  hideCategory?: boolean; // Add flag to hide category in category modal
}

// Fix the MemoizedTransactionItem component
const MemoizedTransactionItem = memo(({ transaction, gainCategoryId, colorScheme, styles, index, hideCategory = false }: TransactionItemProps) => {
  const isIncome = gainCategoryId && transaction.categoryId === gainCategoryId; // Only count as income if it has the Gain tag
  
  // Ensure amount is a number before using Math.abs and toFixed
  const amountValue = typeof transaction.amount === 'number' ? transaction.amount : parseFloat(String(transaction.amount));
  const displayAmount = !isNaN(amountValue) ? Math.abs(amountValue).toFixed(2) : '--.--'; // Fallback display

  // Format Date and Time
  const txDate = new Date(transaction.timestamp);
  const formattedDate = txDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }); // e.g., "Mon, 15"
  const formattedTime = txDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }); // e.g., "10:30 AM"
  
  // Add animation values
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);
  const [shouldRender, setShouldRender] = useState(true);
  
  // Create animated style
  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }]
    };
  });
  
  // Start the animation when component mounts, with staggered delay based on index
  useEffect(() => {
    const delay = index * 50; // 50ms delay between each item
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 300 }));
    
    // Cleanup function for removal animation
    return () => {
      // When component is about to unmount, trigger fade out
      opacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(-20, { duration: 200 });
    };
  }, []);
  
  if (!shouldRender) return null;
  
  return (
    <Animated.View style={animatedStyle}>
      <ThemedView style={styles.transactionItem}>
        <View style={styles.transactionLeft}> 
          <View style={[
            styles.categoryIndicator, 
            { backgroundColor: transaction.categoryId ? 
              PIE_CHART_COLORS[transaction.categoryId % PIE_CHART_COLORS.length] : 
              Colors[colorScheme].tint }
          ]} />
          <View style={styles.transactionDetails}>
            {!hideCategory && (
              <ThemedText style={styles.transactionCategory}>{transaction.categoryName}</ThemedText>
            )}
            <ThemedText style={styles.transactionReason} numberOfLines={1}>
              {transaction.reason || 'No description'}
            </ThemedText>
            <ThemedText style={styles.transactionDateTime} numberOfLines={1}>
              {formattedDate} at {formattedTime}
            </ThemedText>
          </View>
        </View>
        <View style={styles.transactionRight}> 
          <ThemedText style={[
            styles.transactionAmount, 
            isIncome ? styles.incomeText : styles.expenseText
          ]}>
            {isIncome ? '+' : '-'} ₹{displayAmount}
          </ThemedText>
        </View>
      </ThemedView>
    </Animated.View>
  );
}, (prevProps, nextProps) => {
  // Custom equality check for optimization
  return prevProps.transaction.id === nextProps.transaction.id &&
         prevProps.colorScheme === nextProps.colorScheme;
});

// Add a color gradient function based on value
const getBarColorByValue = (value: number, maxValue: number): string => {
  // Define a gradient of colors from low to high values
  const colors = [
    '#4CAF50', // Green for low values
    '#8BC34A', 
    '#CDDC39',
    '#FFEB3B',
    '#FFC107',
    '#FF9800',
    '#FF5722',
    '#F44336'  // Red for high values
  ];
  
  // Calculate the index based on percentage of max value
  // Ensure maxValue is at least 1 to avoid division by zero
  const effectiveMax = Math.max(maxValue, 1);
  const percentage = Math.min(Math.max(value / effectiveMax, 0), 1);
  const index = Math.floor(percentage * (colors.length - 1));
  
  return colors[index];
};

// Helper function to determine text color based on background brightness
const getTextColorForBackground = (hexColor: string): string => {
  // Remove # if present
  hexColor = hexColor.replace('#', '');

  // Convert hex to RGB
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);

  // Calculate luminance (standard formula)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black for light backgrounds, white for dark
  return luminance > 0.6 ? '#000000' : '#FFFFFF'; 
};

// Add a color gradient function for gains (reverse the color scheme)
const getGainBarColorByValue = (value: number, maxValue: number): string => {
  // Define a gradient of colors from low to high values (reverse of expense colors)
  const colors = [
    '#F44336',  // Red for low values
    '#FF5722',
    '#FF9800',
    '#FFC107',
    '#FFEB3B',
    '#CDDC39',
    '#8BC34A',
    '#4CAF50'   // Green for high values
  ];
  
  // Calculate the index based on percentage of max value
  const effectiveMax = Math.max(maxValue, 1);
  const percentage = Math.min(Math.max(value / effectiveMax, 0), 1);
  const index = Math.floor(percentage * (colors.length - 1));
  
  return colors[index];
};

export default function MonthlyAnalyzerScreen() {
  const colorScheme = useColorScheme() || 'dark';
  const styles = getStyles(colorScheme);
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height; // Get screen height

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth()); // 0-indexed
  const [currentChartType, setCurrentChartType] = useState<'expense' | 'gain'>('expense'); // Add state for chart type

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [gainCategoryId, setGainCategoryId] = useState<number | null>(null);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false); // Add state for test data generation
  const [error, setError] = useState<string | null>(null);
  
  // Financial data state
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  // State for category expenses (raw data for pie chart memoization)
  const [categoryExpensesData, setCategoryExpensesData] = useState<{ [key: string]: { amount: number; count: number } }>({});

  // State for gifted-charts bar data
  const [dailyExpenses, setDailyExpenses] = useState<{ [key: string]: number }>({});

  const [groupedTransactions, setGroupedTransactions] = useState<{[key: string]: Transaction[]}>({});

  const [refreshing, setRefreshing] = useState(false);

  // --- Day Modal State (Add original list state) ---
  const [isDayModalVisible, setIsDayModalVisible] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState<string>('');
  const [originalModalTransactions, setOriginalModalTransactions] = useState<Transaction[]>([]); // Full list for the day
  const [modalTransactions, setModalTransactions] = useState<Transaction[]>([]); // Filtered list for display
  // --- End Day Modal State ---

  // --- State for excluding categories ---
  const [excludedCategoryIds, setExcludedCategoryIds] = useState<number[]>([]); // Store IDs to exclude
  const [tempExcludedCategoryIds, setTempExcludedCategoryIds] = useState<number[]>([]); // Temp state for modal
  const [isExclusionModalVisible, setIsExclusionModalVisible] = useState(false); // State for exclusion modal

  // --- Category Modal State ---
  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');
  const [selectedCategoryColor, setSelectedCategoryColor] = useState<string>('');
  const [selectedCategoryTextColor, setSelectedCategoryTextColor] = useState<string>('#FFFFFF');
  const [categoryModalTransactions, setCategoryModalTransactions] = useState<Transaction[]>([]);
  // --- End Category Modal State ---

  // --- Reanimated values for modal animation ---
  const modalOpacity = useSharedValue(0);
  const modalScale = useSharedValue(0.9); // Start slightly smaller

  const animatedModalStyle = useAnimatedStyle(() => {
    return {
      opacity: modalOpacity.value,
      transform: [{ scale: modalScale.value }],
    };
  });

  // --- Category Modal Animation State ---
  const categoryModalOpacity = useSharedValue(0);
  const categoryModalScale = useSharedValue(0.9);

  const animatedCategoryModalStyle = useAnimatedStyle(() => {
    return {
      opacity: categoryModalOpacity.value,
      transform: [{ scale: categoryModalScale.value }],
    };
  });

  // --- Animated Bar State (Add current value state) ---
  const [animatingBarData, setAnimatingBarData] = useState<{
    value: number; // This is the MAX value for the day now
    label: string;
    color: string;
    targetHeight: number; // Initial target height based on full list
    maxValue: number; // Explicit max value
    isGains?: boolean; // Add optional gains flag
  } | null>(null);
  const containerOpacity = useSharedValue(0);
  const barOpacity = useSharedValue(0); 
  const barHeight = useSharedValue(CLONED_BAR_INITIAL_HEIGHT);
  const barWidth = useSharedValue(CLONED_BAR_INITIAL_WIDTH);
  // Shared value for the value represented by the current bar height
  const currentBarValue = useSharedValue(0); 
  // State for JS label (updated via runOnJS)
  const currentLabelValue = useSharedValue('');

  // --- Animated Container Style (Opacity Only) ---
  const animatedContainerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));
  // --- End Animated Container Style ---

  // Add modal touch position tracking
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [barStartHeight, setBarStartHeight] = useState(CLONED_BAR_INITIAL_HEIGHT);
  
  // Add modal dimensions ref
  const modalRef = useRef<View>(null);
  const [modalLayout, setModalLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });

  // Track last filter timestamp to avoid excessive updates
  const lastFilterTimestampRef = useRef(0);

  // Add a ref to track the last filter value to prevent redundant updates
  const lastFilterValue = useRef<number>(0);
  
  // 1. Add a regular state for the label display
  const [displayLabelValue, setDisplayLabelValue] = useState('');
  
  // Function to calculate step values based on actual transaction amounts
  const calculateDynamicStepValues = useCallback((transactions: Transaction[]) => {
    if (!transactions || transactions.length === 0) return [];
    
    // Get all unique transaction amounts, sorted ascending
    const amounts = [...new Set(transactions.map(tx => Math.abs(tx.amount)))].sort((a, b) => a - b);
    
    // Add the maximum amount as the final step
    const maxAmount = Math.max(...amounts);
    
    // Create value "clusters" by rounding to reasonable boundaries
    const stepValues: number[] = [];
    
    // Always start with 0
    stepValues.push(0);
    
    // Add each unique transaction amount, but round to "nice" values
    amounts.forEach(amount => {
      let steppedValue;
      
      if (amount <= 50) {
        steppedValue = Math.round(amount / 5) * 5; // Multiples of 5 up to 50
      } else if (amount <= 500) {
        steppedValue = Math.round(amount / 10) * 10; // Multiples of 10 up to 500
      } else if (amount <= 1000) {
        steppedValue = Math.round(amount / 50) * 50; // Multiples of 50 up to 1000
      } else if (amount <= 2000) {
        steppedValue = Math.round(amount / 100) * 100; // Multiples of 100 up to 2000
      } else if (amount <= 5000) {
        steppedValue = Math.round(amount / 500) * 500; // Multiples of 500 up to 5000
      } else {
        steppedValue = Math.round(amount / 1000) * 1000; // Multiples of 1000 above 5000
      }
      
      // Only add if it's not already in the array
      if (!stepValues.includes(steppedValue)) {
        stepValues.push(steppedValue);
      }
    });
    
    // Ensure the exact maximum amount is included as a step
    if (!stepValues.includes(maxAmount)) {
      stepValues.push(maxAmount);
    }
    
    // Sort the step values
    return stepValues.sort((a, b) => a - b);
  }, []);
  
  // State to store dynamic step values for current day
  const [dynamicStepValues, setDynamicStepValues] = useState<number[]>([]);

  // Function to be called to update filtered transactions 
  const updateFilteredTransactionsWithValue = useCallback((steppedValue: number) => {
    if (!originalModalTransactions || !animatingBarData) return;
    
    // Skip filtering if very close to maximum value
    if (steppedValue >= animatingBarData.maxValue * 0.98) {
      if (modalTransactions.length !== originalModalTransactions.length) {
        setModalTransactions(originalModalTransactions);
      }
    } else {
      // Filter transactions
      const filtered = originalModalTransactions.filter(
        tx => typeof tx.amount === 'number' && Math.abs(tx.amount) <= steppedValue
      );
      
      // Only update state if the filtered count is different
      if (filtered.length !== modalTransactions.length) {
        setModalTransactions(filtered);
      }
    }
  }, [originalModalTransactions, animatingBarData, modalTransactions.length]);
  
  // Touch handlers
  const handleBarTouchStart = useCallback((y: number) => {
    setIsDragging(true);
    setDragStartY(y);
    setBarStartHeight(barHeight.value);
  }, [barHeight.value]);

  // Track animation frame request ID
  const animationFrameRef = useRef<number | null>(null);

  // Use a simpler approach for gesture handling
  const handleModalTouchMove = useCallback((moveEvent: GestureResponderEvent) => {
    if (!isDragging || !animatingBarData) return;

    // Cancel any pending animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Get position and calculate new height immediately
    const { pageY } = moveEvent.nativeEvent;
    const dragDeltaY = dragStartY - pageY;
    const newHeight = barStartHeight + dragDeltaY;
    const clampedHeight = Math.max(20, Math.min(newHeight, CLONED_BAR_MAX_HEIGHT));
    
    // Calculate the raw value
    const heightRatio = clampedHeight / CLONED_BAR_MAX_HEIGHT;
    const rawValue = heightRatio * animatingBarData.maxValue;
    
    // Find the closest step value from our dynamic step values
    let steppedValue = 0;
    
    if (dynamicStepValues.length > 0) {
      // Check if we're close to max height (within 10% of max)
      if (clampedHeight >= CLONED_BAR_MAX_HEIGHT * 0.9) {
        // If we're dragging close to the top, snap to the maximum value
        steppedValue = animatingBarData.maxValue;
      } else {
        // Find the closest step that's less than or equal to the raw value
        for (let i = 0; i < dynamicStepValues.length; i++) {
          if (dynamicStepValues[i] <= rawValue) {
            steppedValue = dynamicStepValues[i];
          } else {
            break; // Stop once we exceed the raw value
          }
        }
      }
    } else {
      // Fallback to old calculation if no dynamic steps available
      if (rawValue <= 50) {
        steppedValue = Math.round(rawValue / 5) * 5; // Multiples of 5 up to 50
      } else if (rawValue <= 500) {
        steppedValue = Math.round(rawValue / 10) * 10; // Multiples of 10 up to 500
      } else if (rawValue <= 1000) {
        steppedValue = Math.round(rawValue / 50) * 50; // Multiples of 50 up to 1000
      } else if (rawValue <= 2000) {
        steppedValue = Math.round(rawValue / 100) * 100; // Multiples of 100 up to 2000
      } else if (rawValue <= 5000) {
        steppedValue = Math.round(rawValue / 500) * 500; // Multiples of 500 up to 5000
      } else {
        steppedValue = Math.round(rawValue / 1000) * 1000; // Multiples of 1000 above 5000
      }
    }
    
    // Use Animated.setValue for immediate bar height update
    barHeight.value = clampedHeight;
    
    // Only update the display value if it changed
    if (lastFilterValue.current !== steppedValue) {
      const newDisplayValue = `₹${steppedValue.toFixed(0)}`;
      setDisplayLabelValue(newDisplayValue);
      
      // Log for debugging
      console.log(`[DynamicSteps] Raw value: ${rawValue.toFixed(2)}, Selected step: ${steppedValue}`);
      
      // Store the value for filtering after drag ends, but don't filter yet
      lastFilterValue.current = steppedValue;
    }
  }, [
    isDragging, 
    animatingBarData, 
    dragStartY, 
    barStartHeight,
    dynamicStepValues
  ]);

  // Add touch end function that updates the list after dragging ends
  const handleModalTouchEnd = useCallback(() => {
    setIsDragging(false);
    
    // Only filter when drag ends
    if (lastFilterValue.current && animatingBarData) {
      // Use animation frame for smoother transition
      requestAnimationFrame(() => {
        updateFilteredTransactionsWithValue(lastFilterValue.current);
      });
    }
  }, [updateFilteredTransactionsWithValue, animatingBarData]);

  // --- Modal layout callback ---
  const onModalLayout = (event: LayoutChangeEvent) => {
    const {x, y, width, height} = event.nativeEvent.layout;
    setModalLayout({x, y, width, height});
  };

  // --- Update handleBarPress to calculate dynamic steps ---
  const handleBarPress = useCallback(({ day, value, color, isGains }: { day: string, value: number, color: string, isGains?: boolean }) => {
    const transactionsForDay = groupedTransactions[day] || [];
    
    if (transactionsForDay.length === 0) return;
    
    // Filter transactions based on gains/expense view before sorting
    const viewFilteredTransactions = isGains
      ? transactionsForDay.filter(tx => gainCategoryId && tx.categoryId === gainCategoryId)
      : transactionsForDay.filter(tx => gainCategoryId ? tx.categoryId !== gainCategoryId : tx.amount < 0);
    
    if (viewFilteredTransactions.length === 0) return;
    
    // Pre-sort once
    const sortedTransactions = [...viewFilteredTransactions].sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
    setOriginalModalTransactions(sortedTransactions);
    
    // Find highest individual transaction with one pass
    let highestTransactionAmount = 0;
    for (let i = 0; i < sortedTransactions.length; i++) {
      const tx = sortedTransactions[i];
      const txAmount = Math.abs(tx.amount);
      if (txAmount > highestTransactionAmount) {
        highestTransactionAmount = txAmount;
      }
    }
    
    // Default if no transactions found
    if (highestTransactionAmount === 0) {
      highestTransactionAmount = value;
    }
    
    // Calculate transaction threshold index using binary search
    // since we already sorted by amount
    let thresholdIndex = sortedTransactions.length - 1;
    let low = 0;
    let high = sortedTransactions.length - 1;
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midAmount = Math.abs(sortedTransactions[mid].amount);
      
      if (midAmount <= highestTransactionAmount) {
        low = mid + 1;
      } else {
        thresholdIndex = mid - 1;
        high = mid - 1;
      }
    }
    
    // Get transactions up to threshold index
    const initialFilteredTransactions = sortedTransactions.slice(0, thresholdIndex + 1);
    setModalTransactions(initialFilteredTransactions);
    
    // Calculate dynamic step values based on the day's transactions
    const steps = calculateDynamicStepValues(sortedTransactions);
    console.log(`[DynamicSteps] Calculated ${steps.length} step values:`, steps);
    setDynamicStepValues(steps);
    
    // Set initial state with animation values - start at max height showing highest transaction
    currentBarValue.value = highestTransactionAmount;
    
    // Update display label directly
    setDisplayLabelValue(`₹${highestTransactionAmount.toFixed(0)}`);
    
    setSelectedDayKey(day);
    setIsDayModalVisible(true);
    
    // Set animation data - KEY CHANGE: use highestTransactionAmount as the maxValue
    setAnimatingBarData({
      value: highestTransactionAmount, // The highest individual transaction amount
      label: day, 
      color: color,
      targetHeight: CLONED_BAR_MAX_HEIGHT, // Still use full height
      maxValue: highestTransactionAmount, // Use highest transaction as max, not total sum
      isGains, // Add optional gains flag
    });
  }, [groupedTransactions, setIsDayModalVisible, setModalTransactions, setSelectedDayKey, setAnimatingBarData, currentBarValue, setOriginalModalTransactions, gainCategoryId, calculateDynamicStepValues]);

  // Move handlePieSlicePress up before pieChartData useMemo
  
  // --- Event Handlers ---
  const handlePieSlicePress = useCallback((categoryName: string, categoryColor: string) => {
    // Add debug logging
    console.log('[PieChart] Slice pressed for category:', categoryName);
    
    // Filter the main transactions list, which is available in component state
    const transactionsForCategory = transactions.filter(tx => (tx.categoryName || 'Uncategorized') === categoryName);
    console.log(`[PieChart] Found ${transactionsForCategory.length} transactions for category ${categoryName}`);
    
    // Group transactions by date
    const groupedByDate: { [key: string]: Transaction[] } = {};
    
    transactionsForCategory.forEach(tx => {
      const date = new Date(tx.timestamp);
      const dateKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
      
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = [];
      }
      
      groupedByDate[dateKey].push(tx);
    });
    
    // Sort dates in descending order (newest first)
    const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));
    
    // Flatten the transactions but add section markers for dates
    const processedTransactions: (Transaction & { isDateHeader?: boolean, dateString?: string })[] = [];
    
    sortedDates.forEach(dateKey => {
      // Add a date header marker
      const date = new Date(dateKey);
      const dateHeader = {
        id: `header-${dateKey}`,
        amount: 0,
        timestamp: date.getTime(),
        isDateHeader: true,
        dateString: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      } as Transaction & { isDateHeader: boolean, dateString: string };
      
      processedTransactions.push(dateHeader);
      
      // Add the transactions for this date
      const transactionsForDate = groupedByDate[dateKey];
      processedTransactions.push(...transactionsForDate);
    });
    
    // Determine contrast text color for header
    const textColor = getTextColorForBackground(categoryColor);
    
    setCategoryModalTransactions(processedTransactions);
    setSelectedCategoryName(categoryName);
    setSelectedCategoryColor(categoryColor);
    setSelectedCategoryTextColor(textColor);
    setIsCategoryModalVisible(true);
  }, [transactions, setCategoryModalTransactions, setSelectedCategoryName, setIsCategoryModalVisible]);

  const pieChartData = useMemo(() => {
    return Object.entries(categoryExpensesData)
      .filter(([, data]: [string, { amount: number, count: number }]) => data.amount > 0) 
      .sort(([, a]: [string, { amount: number }], [, b]: [string, { amount: number }]) => b.amount - a.amount) 
      .map(([name, data]: [string, { amount: number, count: number }], index: number) => {
        const baseColor = PIE_CHART_COLORS[index % PIE_CHART_COLORS.length];
        const lighterColor = baseColor + 'AA'; // Use AA for slight transparency
        const textColor = getTextColorForBackground(baseColor); // Calculate text color
        
        // Create a direct onPress handler that logs and performs the action
        const onPressHandler = () => {
          console.log('[PieChart] Direct onPress handler for', name);
          handlePieSlicePress(name, baseColor);
        };
        
        return {
          value: data.amount,
          text: `₹${data.amount.toFixed(0)}`, // Keep amounts inside
          label: `${name}`, // Simpler label without count
          color: baseColor, 
          gradientCenterColor: lighterColor, // Add gradient center color
          onPress: onPressHandler, 
          shiftTextX: 0, // Reset text shift
          shiftTextY: 0, // Reset text shift
          textSize: 10, // Smaller text size for inside
          textColor: textColor, // Use dynamic text color
          categoryName: name, 
        };
      });
  }, [categoryExpensesData, handlePieSlicePress, colorScheme]);

  // Now the barData useMemo can safely reference handleBarPress
  const barData = useMemo(() => {
    // Calculate the max value for color scaling
    const values = Object.values(dailyExpenses).filter(amount => amount > 0);
    const maxAmount = values.length > 0 ? Math.max(...values) : 0;
    
    return Object.entries(dailyExpenses)
      .filter(([, amount]: [string, number]) => amount > 0)
      .sort(([dayA]: [string, any], [dayB]: [string, any]) => parseInt(dayA) - parseInt(dayB))
      .map(([day, amount]: [string, number]) => {
        // Get color based on value height
        const color = getBarColorByValue(amount, maxAmount);
        
          return {
            value: amount,
            label: day, 
          frontColor: color, // Use the dynamic color
          onPress: () => handleBarPress({ day, value: amount, color }), // Pass color to handler
          topLabelComponent: () => (
            <ThemedText style={styles.barTopLabel}>
              ₹{amount.toFixed(0)}
            </ThemedText>
          ),
          labelTextStyle: styles.barXLabel,
          };
        });
  }, [dailyExpenses, styles.barTopLabel, styles.barXLabel, handleBarPress]); 
  
  // --- Animation Effects ---
  useEffect(() => {
    if (isDayModalVisible) {
      // Animate In
      modalOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) });
      // Use withSpring for a slight bounce, or withTiming for simple scale
      modalScale.value = withSpring(1, { damping: 15, stiffness: 100 }); 
      // modalScale.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) });
    } else {
      // Animate Out
      modalOpacity.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.ease) });
      modalScale.value = withTiming(0.9, { duration: 200, easing: Easing.in(Easing.ease) });
    }
  }, [isDayModalVisible]);

  useEffect(() => {
    if (isCategoryModalVisible) {
      console.log('[CategoryModal] Showing category modal');
      // Animate In
      categoryModalOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) });
      categoryModalScale.value = withSpring(1, { damping: 15, stiffness: 100 });
    } else {
      console.log('[CategoryModal] Hiding category modal');
      // Animate Out
      categoryModalOpacity.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.ease) });
      categoryModalScale.value = withTiming(0.9, { duration: 200, easing: Easing.in(Easing.ease) });
    }
  }, [isCategoryModalVisible]);

  // --- Simplified Animation Effect ---
  useEffect(() => {
    if (!animatingBarData) {
      // Animate OUT (simplified)
      containerOpacity.value = withTiming(0, { duration: 150, easing: Easing.linear });
      barOpacity.value = withTiming(0, { duration: 100, easing: Easing.linear });
      return; 
    }

    // Animation setup (simplified for performance)
    containerOpacity.value = 0; 
    barHeight.value = CLONED_BAR_INITIAL_HEIGHT; 
    barWidth.value = CLONED_BAR_INITIAL_WIDTH; 
    barOpacity.value = 0;
    
    // Initial values
    currentBarValue.value = animatingBarData.maxValue;
    
    // Update state directly
    setDisplayLabelValue(`₹${animatingBarData.maxValue.toFixed(0)}`);
    // Initialize last filter value
    lastFilterValue.current = animatingBarData.maxValue;

    // Simple, performant animation in
    containerOpacity.value = withTiming(1, { duration: 200 });
    barHeight.value = withTiming(animatingBarData.targetHeight, { duration: 300 });
    barWidth.value = withTiming(CLONED_BAR_TARGET_WIDTH, { duration: 300 });
    barOpacity.value = withTiming(1, { duration: 200 });

  }, [animatingBarData]);

  // --- Filtering Logic (Optimized) ---
  const updateFilteredTransactions = useCallback((currentValue: number) => {
    if (!originalModalTransactions || !animatingBarData) return;
    
    // Update label using shared value instead of state setter
    currentLabelValue.value = `₹${currentValue.toFixed(0)}`;
    
    // Binary search would be ideal, but since we don't know the exact distribution
    // of values, we'll use a quick filter with early bailout
    
    // If value is above max, show all transactions (most common case)
    if (currentValue >= animatingBarData.maxValue * 0.99) {
      setModalTransactions(originalModalTransactions);
      return;
    }
    
    // Only filter if the value changed significantly to avoid excessive re-renders
    const filtered = originalModalTransactions.filter(
      tx => typeof tx.amount === 'number' && Math.abs(tx.amount) <= currentValue
    );
    
    // Only update if count changed (much faster than JSON comparison)
    if (filtered.length !== modalTransactions.length) {
      setModalTransactions(filtered);
    }
  }, [originalModalTransactions, animatingBarData, modalTransactions.length]);

  // --- Optimized Data Fetching ---
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Perform the initial fetch
      const fetchedTransactions = await getAllTransactions({
        year: selectedYear,
        month: selectedMonth + 1, // DB function expects 1-indexed month
      });
      
      // Set raw transactions for immediate UI update
      setTransactions(fetchedTransactions);

      // Defer heavy processing using InteractionManager
      // InteractionManager.runAfterInteractions(() => {
      let income = 0;
      let expenses = 0;
        const currentCategoryExpenses: { [key: string]: { amount: number; count: number } } = {};
        const currentDailyExpenses: { [key: string]: number } = {};
      const transactionsByDate: {[key: string]: Transaction[]} = {};

        // Optimize loop for performance
        const txCount = fetchedTransactions.length;
        for (let i = 0; i < txCount; i++) {
          const tx = fetchedTransactions[i];
          const txDate = new Date(tx.timestamp);
          const dayOfMonth = txDate.getDate().toString();
          
          // --- Add exclusion check --- 
          if (tx.categoryId && excludedCategoryIds.includes(tx.categoryId)) {
            return; // Skip this transaction entirely if its category is excluded
          }
          // --- End exclusion check ---

          if (!transactionsByDate[dayOfMonth]) {
            transactionsByDate[dayOfMonth] = [];
          }
          transactionsByDate[dayOfMonth].push(tx);
          
        const isIncome = gainCategoryId && tx.categoryId === gainCategoryId; // Only count as income if it has the Gain tag
        
        if (isIncome) {
          income += Math.abs(tx.amount);
        } else {
          expenses += Math.abs(tx.amount);
          const categoryName = tx.categoryName || 'Uncategorized';
            
            if (!currentCategoryExpenses[categoryName]) {
              currentCategoryExpenses[categoryName] = { amount: 0, count: 0 };
            }
            currentCategoryExpenses[categoryName].amount += Math.abs(tx.amount);
            currentCategoryExpenses[categoryName].count += 1;
            
            currentDailyExpenses[dayOfMonth] = (currentDailyExpenses[dayOfMonth] || 0) + Math.abs(tx.amount);
          }
        }
        
        // Batch state updates to reduce render cycles
      setGroupedTransactions(transactionsByDate);
      setTotalIncome(income);
      setTotalExpenses(expenses);
        setDailyExpenses(currentDailyExpenses);
        setCategoryExpensesData(currentCategoryExpenses);

        // Clear loading states
        setIsLoading(false);
        setRefreshing(false);
      // });
    } catch (err: any) {
      console.error('[Analyzer] Error:', err);
      setError(`Failed to load data: ${err.message || String(err)}`);
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [selectedYear, selectedMonth, gainCategoryId, excludedCategoryIds]);

  // Fetch Gain Category ID once on mount, but don't block on it
  useEffect(() => {
    let isMounted = true;
    const fetchGainId = async () => {
      console.log("[Analyzer] Fetching Gain Category ID...")
      try {
        const id = await getGainCategoryId();
        if (isMounted) {
          if (id === null) {
            console.warn("[Analyzer] Warning: Gain Category ID not found. Using amount sign for income/expense detection.");
          } else {
            console.log(`[Analyzer] Gain Category ID: ${id}`);
          }
          setGainCategoryId(id);
        }
      } catch (err) {
        console.error("[Analyzer] Error fetching Gain ID:", err);
        // Don't set error state here - we can still show data
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    fetchGainId();
    return () => { isMounted = false; };
  }, []);

  // Remove logging from useFocusEffect
  // useFocusEffect(
  //   useCallback(() => {
  //     fetchData(); // Call the memoized fetch function
  //   }, [fetchData])
  // );
  
  // Fetch data whenever relevant state changes (year, month, exclusions, gain ID)
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle pull-to-refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData().then(() => {
      setRefreshing(false);
    });
  }, [fetchData]);

  // --- UI Handlers ---
  const changeMonth = (delta: number) => {
    const newDate = new Date(selectedYear, selectedMonth + delta, 1);
    setSelectedYear(newDate.getFullYear());
    setSelectedMonth(newDate.getMonth());
    // Data refetch is handled by useFocusEffect via fetchData dependency change
  };

  // Handle test data generation
  const handleGenerateData = async () => {
    setIsGenerating(true);
    setError(null);
    
    try {
      const success = await generateTestDataForMonth(selectedYear, selectedMonth + 1, 50); // Generate 50 transactions
      
      if (success) {
        Alert.alert(
          "Success", 
          `Generated test data for ${getMonthName(selectedMonth)} ${selectedYear}.`,
          [{ text: "OK" }]
        );
        // Refresh data to show the newly generated transactions
        await fetchData();
      } else {
        Alert.alert(
          "Error", 
          "Failed to generate test data. Please try again.",
          [{ text: "OK" }]
        );
      }
    } catch (err: any) {
      console.error("[Analyzer] Error generating test data:", err);
      Alert.alert(
        "Error", 
        `Failed to generate test data: ${err.message}`,
        [{ text: "OK" }]
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // Month Navigation
  const renderMonthNavigation = () => (
    <ThemedView style={styles.monthNavigationContainer}>
      <TouchableOpacity 
        style={styles.monthNavigationButton} 
        onPress={() => changeMonth(-1)}
      >
        <Ionicons 
          name="chevron-back" 
          size={22} 
          color={Colors[colorScheme].tint} 
        />
      </TouchableOpacity>
      
      <ThemedText style={styles.monthNavigationText}>
        {getMonthName(selectedMonth)} {selectedYear}
      </ThemedText>
      
      <TouchableOpacity 
        style={styles.monthNavigationButton} 
        onPress={() => changeMonth(1)}
      >
        <Ionicons 
          name="chevron-forward" 
          size={22} 
          color={Colors[colorScheme].tint} 
        />
      </TouchableOpacity>
    </ThemedView>
  );

  // Financial Summary Box
  const renderFinancialSummary = () => (
    <ThemedView style={styles.summaryBox}>
      {/* RE-ADD: Button to open exclusion modal */}
      {allCategories.length > 0 && ( // Show button if categories are loaded
          <View style={styles.filterButtonContainer}>
              <TouchableOpacity style={styles.filterButton} onPress={() => setIsExclusionModalVisible(true)}>
                  <Ionicons name="filter-outline" size={16} color={Colors[colorScheme].tint} style={{ marginRight: 5 }} />
                  <ThemedText style={styles.filterButtonText}>
                      Exclude Categories ({excludedCategoryIds.length})
                  </ThemedText>
              </TouchableOpacity>
          </View>
      )}
      {/* End Re-add */}

      <View style={styles.summaryRow}>
        <ThemedText style={styles.summaryLabel}>Total Income:</ThemedText>
        <ThemedText style={[styles.summaryValue, styles.incomeValue]}>
          +₹{totalIncome.toFixed(2)}
        </ThemedText>
      </View>

      <View style={styles.summaryRow}>
        <ThemedText style={styles.summaryLabel}>Total Expenses:</ThemedText>
        <ThemedText style={[styles.summaryValue, styles.expenseValue]}>
          -₹{totalExpenses.toFixed(2)}
        </ThemedText>
      </View>

      <View style={[styles.summaryRow, styles.netAmountRow]}>
        <ThemedText style={styles.summaryLabelNet}>Net Amount:</ThemedText>
        <ThemedText style={[
          styles.summaryValueNet,
          (totalIncome > totalExpenses) ? styles.incomeValue : styles.expenseValue
        ]}>
          {totalIncome > totalExpenses ? '+' : '-'}₹{Math.abs(totalIncome - totalExpenses).toFixed(2)}
        </ThemedText>
      </View>
    </ThemedView>
  );

  // Test Data Generation Button
  const renderTestDataButton = () => (
    <TouchableOpacity
      style={[
        styles.generateButton,
        isGenerating && styles.generateButtonDisabled
      ]}
      onPress={handleGenerateData}
      disabled={isGenerating}
    >
      {isGenerating ? (
        <ActivityIndicator size="small" color={Colors[colorScheme].white} />
      ) : (
        <ThemedText style={styles.generateButtonText}>
          Generate Test Data
        </ThemedText>
      )}
    </TouchableOpacity>
  );

  // Format date for display
  const formatDate = (day: string) => {
    const date = new Date(selectedYear, selectedMonth, parseInt(day));
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      day: 'numeric',
      month: 'short'
    });
  };

  // Optimize the renderTransactionItem function to prevent unnecessary re-renders
  const renderTransactionItem = useCallback(({ item, index }: { item: Transaction, index: number }) => (
    <MemoizedTransactionItem
      transaction={item}
      gainCategoryId={gainCategoryId}
      styles={styles}
      colorScheme={colorScheme}
      index={index}
    />
  ), [gainCategoryId, styles, colorScheme]);

  // --- Add Rotation Animation State ---
  const rotation = useSharedValue(0);

  const rotatingStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });

  // Start rotation animation on mount
  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 20000, easing: Easing.linear }), // Rotate 360 degrees over 20 seconds
      -1, // Repeat indefinitely
      false // Don't reverse direction
    );
  }, []);

  // --- State for flipping between expense and gains views ---
  const [showGainsView, setShowGainsView] = useState(false);
  const flipProgress = useSharedValue(0); // 0 = expenses, 1 = gains

  // --- Animation styles for flip effect ---
  const frontAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    const rotateY = interpolate(
      flipProgress.value,
      [0, 1],
      [0, 180]
    );
    
    return {
      transform: [
        { perspective: 1000 },
        { rotateY: `${rotateY}deg` },
      ],
      backfaceVisibility: 'hidden',
      position: 'absolute',
      width: '100%',
      height: '100%',
      // Use opacity instead of z-index for smoother transitions
      opacity: flipProgress.value >= 0.5 ? 0 : 1,
      pointerEvents: flipProgress.value < 0.5 ? 'auto' : 'none',
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    const rotateY = interpolate(
      flipProgress.value,
      [0, 1],
      [180, 360]
    );
    
    return {
      transform: [
        { perspective: 1000 },
        { rotateY: `${rotateY}deg` },
      ],
      backfaceVisibility: 'hidden',
      position: 'absolute',
      width: '100%',
      height: '100%',
      // Use opacity instead of z-index for smoother transitions
      opacity: flipProgress.value < 0.5 ? 0 : 1,
      pointerEvents: flipProgress.value >= 0.5 ? 'auto' : 'none',
    };
  });

  // Handle flip button press with improved animation
  const handleFlip = useCallback(() => {
    cancelAnimation(flipProgress);
    const toValue = showGainsView ? 0 : 1;
    flipProgress.value = withSpring(toValue, {
      mass: 1, damping: 20, stiffness: 100, overshootClamping: false, restSpeedThreshold: 0.1, restDisplacementThreshold: 0.1,
    });
    setShowGainsView(!showGainsView);
    // Important: Trigger data recalculation/refiltering for the new view
    // fetchData(); // REMOVE direct call here if present, dependency array handles it
  }, [showGainsView, flipProgress]); // Ensure fetchData is NOT in this dependency array
  
  // Style for the flip button in the header
  const flipButtonStyle = useMemo(() => {
    return {
      padding: 8,
      backgroundColor: Colors[colorScheme].card,
      borderRadius: 20,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 12,
    }
  }, [colorScheme]);
  
  const flipButtonTextStyle = useMemo(() => {
    return {
      color: Colors[colorScheme].tint,
      fontSize: 14,
      fontWeight: 'bold' as const,
      marginLeft: 5,
    }
  }, [colorScheme]);

  // Content Rendering Logic
  const renderContent = (isGainsView = false) => {
    if (isLoading && !refreshing) {
      return <ActivityIndicator size="large" color={Colors[colorScheme].tint} style={styles.loader} />;
    }

    if (error) {
      return <ThemedText style={styles.errorText}>{error}</ThemedText>;
    }

    if (transactions.length === 0) {
      return <ThemedText style={styles.infoText}>No transactions found for this period.</ThemedText>;
    }

    // Filter transactions based on whether we're in the gains view or expense view
    const filteredTransactions = isGainsView 
      ? transactions.filter(tx => gainCategoryId && tx.categoryId === gainCategoryId) // Only include transactions with Gain tag
      : transactions.filter(tx => gainCategoryId ? tx.categoryId !== gainCategoryId : tx.amount < 0);

    if (filteredTransactions.length === 0) {
      return <ThemedText style={styles.infoText}>No {isGainsView ? 'income' : 'expense'} transactions found for this period.</ThemedText>;
    }

    // Process data for the current view
    const dailyAmounts: { [key: string]: number } = {};
    
    // Group by day
    filteredTransactions.forEach(tx => {
      const date = new Date(tx.timestamp);
      const day = date.getDate().toString();
      
      const amount = Math.abs(tx.amount);
      dailyAmounts[day] = (dailyAmounts[day] || 0) + amount;
    });
    
    // Calculate max value for color scaling
    const values = Object.values(dailyAmounts).filter(amount => amount > 0);
    const maxAmount = values.length > 0 ? Math.max(...values) : 0;
    
    // Format data for bar chart
    const chartData = Object.entries(dailyAmounts)
      .filter(([, amount]: [string, number]) => amount > 0)
      .sort(([dayA]: [string, any], [dayB]: [string, any]) => parseInt(dayA) - parseInt(dayB))
      .map(([day, amount]: [string, number]) => {
        // Get color based on value height - use appropriate color function
        const color = isGainsView 
          ? getGainBarColorByValue(amount, maxAmount) 
          : getBarColorByValue(amount, maxAmount);
        
        return {
          value: amount,
          label: day, 
          frontColor: color,
          onPress: () => handleBarPress({ day, value: amount, color, isGains: isGainsView }),
          topLabelComponent: () => (
            <ThemedText style={styles.barTopLabel}>
              ₹{amount.toFixed(0)}
            </ThemedText>
          ),
          labelTextStyle: styles.barXLabel,
        };
      });

    // Define fixed bar width and minimum desired spacing
    const barWidth = 20;
    const minBarSpacing = 30; 
    const numBars = chartData.length;

    // Determine required chart container width for scroll view
    const chartContainerWidth = numBars > 0 
      ? (barWidth + minBarSpacing) * numBars - minBarSpacing + (minBarSpacing + 60)
      : screenWidth - 30;

    // Calculate pretty max Y value
    const maxYValue = chartData.length > 0 ? Math.max(...chartData.map(item => item.value)) : 0;
    const prettyMaxValue = roundUpToPrettyNumber(maxYValue);

    return (
      <ScrollView 
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {renderFinancialSummary()}

        {/* Daily Chart (Expenses or Gains) */}
        {chartData.length > 0 && (
          <ThemedView style={styles.chartContainer}>
            <ThemedText style={styles.chartTitle}>
              Daily {isGainsView ? 'Income' : 'Expenses'}
            </ThemedText>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              contentContainerStyle={{ paddingHorizontal: 10 }}
            >
              <View style={{ width: chartContainerWidth }}> 
                <BarChart
                  data={chartData}
                  barWidth={barWidth}
                  spacing={minBarSpacing}
                  maxValue={prettyMaxValue}
                  yAxisThickness={0}
                  xAxisThickness={1}
                  xAxisColor={Colors[colorScheme].border}
                  yAxisTextStyle={{ color: Colors[colorScheme].textSecondary, fontSize: 10 }}
                  noOfSections={4}
                  isAnimated 
                  initialSpacing={10}
                  endSpacing={0}
                  barBorderRadius={4}
                  showFractionalValues 
                  dashGap={0} 
                  rulesType="solid" 
                  rulesColor={Colors[colorScheme].border}
                  xAxisLabelTextStyle={{ color: Colors[colorScheme].textSecondary, fontSize: 10 }}
                />
              </View>
            </ScrollView>
          </ThemedView>
        )}
        
        {/* Category Expenses Pie Chart - Only show in expense view */}
        {!isGainsView && pieChartData.length > 0 && (
          <ThemedView style={styles.chartContainer}> 
            <ThemedText style={styles.chartTitle}>Expenses by Category</ThemedText>
            <View style={styles.pieChartWrapper}>
              <Animated.View style={rotatingStyle}>
                <PieChart
                  data={pieChartData}
                  donut
                  showText
                  radius={screenWidth / 3.5}
                  innerRadius={screenWidth / 7}
                  textSize={10}
                  focusOnPress
                  strokeWidth={1}
                  strokeColor={Colors[colorScheme].background}
                  centerLabelComponent={() => (
                    <View style={{justifyContent: 'center', alignItems: 'center'}}>
                      <ThemedText style={{fontSize: 20, fontWeight: 'bold', color: Colors[colorScheme].text}}>
                        {pieChartData.length}
                      </ThemedText>
                      <ThemedText style={{fontSize: 12, color: Colors[colorScheme].textSecondary}}>
                        Categories
                      </ThemedText>
      </View>
                  )}
                />
              </Animated.View>
            </View>
            {/* Render Legend Below Chart */}
            <View style={styles.legendContainer}>
              {pieChartData.map((item, index) => (
                <TouchableOpacity 
                  key={`legend-${index}`} 
                  style={styles.legendItem} 
                  onPress={() => {
                    console.log('[Legend] Item pressed for', item.categoryName);
                    handlePieSlicePress(item.categoryName, item.color);
                  }}
                  activeOpacity={0.6}
                >
                  <View style={[styles.legendColorBox, { backgroundColor: item.color }]} />
                  <ThemedText style={styles.legendText} numberOfLines={1} ellipsizeMode="tail">
                    {item.label} - ₹{item.value.toFixed(0)}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </ThemedView>
        )}

        {/* Daily Expense Modal - New Touch-Aware Version */}
      <Modal
          animationType="none" 
        transparent={true}
        visible={isDayModalVisible}
        onRequestClose={() => {
          setIsDayModalVisible(false);
            setSelectedDayKey('');
            setAnimatingBarData(null); 
          }}
        >
          <View 
            style={styles.modalOverlay}
            onTouchMove={isDragging ? handleModalTouchMove : undefined}
            onTouchEnd={isDragging ? handleModalTouchEnd : undefined}
          > 
            <Animated.View 
              style={[styles.modalContainer, animatedModalStyle]}
              onLayout={onModalLayout}
              ref={modalRef}
            >
              {/* --- Bar Area (Simple View with TouchableOpacity) --- */}
              <View style={styles.barAreaContainer}> 
                {animatingBarData && (
                  <>
                    {/* Max Value Text */}
                    <Text style={styles.maxValueText}>
                      Max {animatingBarData.isGains ? 'Income' : 'Expense'}: ₹{animatingBarData.maxValue.toFixed(0)}
                    </Text>
                    
                    {/* Drag Indicator */}
                    <Ionicons 
                      name="swap-vertical-outline" 
                      size={14} 
                      color={animatingBarData.color} // Use the bar's color
                      style={styles.dragIcon} 
                    />
                    
                    {/* Current Value Label */}
                    <Text style={[styles.animatedBarLabel, { color: animatingBarData.color }]}> 
                      {displayLabelValue}
                    </Text>
                    
                    {/* Revert to TouchableOpacity for simpler interaction */}
                    <TouchableOpacity
                      style={styles.touchableBarContainer}
                      activeOpacity={0.8}
                      onPressIn={(e) => {
                        console.log('[Touch] onPressIn triggered');
                        if (e.nativeEvent) {
                          handleBarTouchStart(e.nativeEvent.pageY);
                        }
                      }}
                    >
                      <Animated.View 
                        style={[
                          styles.animatedBar,
                          {
                            backgroundColor: animatingBarData.color,
                            opacity: barOpacity,
                            height: barHeight,
                          }
                        ]}
                      />
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* --- Modal Content Area --- */}
              <View style={styles.modalContentArea}> 
            <View style={styles.modalHeader}>
                  <ThemedText style={styles.modalHeaderText}>
                    {selectedDayKey ? formatDate(selectedDayKey) : ''}
                  </ThemedText>
              <TouchableOpacity 
                onPress={() => {
                      setIsDragging(false);
                  setIsDayModalVisible(false);
                      setSelectedDayKey('');
                      setAnimatingBarData(null); 
                }}
                style={styles.closeButton}
              >
                 <Ionicons name="close-circle" size={28} color={Colors[colorScheme].textSecondary} />
              </TouchableOpacity>
            </View>
                {/* Transaction List */}
            <FlatList
                  data={modalTransactions}
                  renderItem={renderTransactionItem} 
              keyExtractor={(item, index) => `modal-tx-${item?.id || index}`} 
              style={styles.modalList}
                  scrollEnabled={true}
                  maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                  ListEmptyComponent={
                    <ThemedText style={styles.modalEmptyText}>
                      No transactions found in this range.
                    </ThemedText>
                  }
                />
              </View>
            </Animated.View> 
        </View>
      </Modal>

        {/* Category Expense Modal */}
        <Modal
          animationType="none" // Reanimated handles animation
          transparent={true}
          visible={isCategoryModalVisible}
          onRequestClose={() => {
            setIsCategoryModalVisible(false);
            setSelectedCategoryName('');
            setSelectedCategoryColor('');
            setSelectedCategoryTextColor('#FFFFFF');
          }}
        >
          <View style={styles.modalOverlay}>
            <Animated.View style={[styles.modalContainer, animatedCategoryModalStyle]}>
              {/* Content container with sidebar */}
              <View style={styles.categoryModalSideContainer}>
                {/* Single colored sidebar with vertical text */}
                <View 
                  style={[
                    styles.categoryModalSideBar,
                    { backgroundColor: selectedCategoryColor || Colors[colorScheme].tint }
                  ]}
                >
                  <View style={styles.verticalTextContainer}>
                    <Text 
                      style={[
                        styles.categoryModalSideText,
                        { color: selectedCategoryTextColor }
                      ]}
                    >
                      {selectedCategoryName || 'CATEGORY'}
                    </Text>
                  </View>
                </View>
                
                {/* Main content area */}
                <View style={styles.categoryModalContent}>
                  <SectionList
                    sections={
                      // Group transactions by date and format for SectionList
                      (() => {
                        const groups: { [key: string]: Transaction[] } = {};
                        categoryModalTransactions.forEach(tx => {
                          const date = new Date(tx.timestamp);
                          const dateKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
                          if (!groups[dateKey]) {
                            groups[dateKey] = [];
                          }
                          groups[dateKey].push(tx);
                        });
                        
                        return Object.keys(groups)
                          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime()) // Sort dates descending
                          .map(dateKey => ({
                            title: new Date(dateKey).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                            data: groups[dateKey]
                          }));
                      })()
                    }
                    renderItem={({ item, index }) => (
                      // Use MemoizedTransactionItem for rendering each transaction
                      <MemoizedTransactionItem
                        transaction={item}
                        gainCategoryId={gainCategoryId}
                        styles={styles}
                        colorScheme={colorScheme}
                        index={index} // Pass index for potential staggered animation
                        hideCategory={true}
                      />
                    )}
                    renderSectionHeader={({ section: { title } }) => (
                      // Render the date header for each section
                      <View style={styles.sectionHeaderContainer}>
                        <ThemedText style={styles.sectionHeaderText}>{title}</ThemedText>
                      </View>
                    )}
                    keyExtractor={(item) => `category-tx-${item.id}`}
                    stickySectionHeadersEnabled={true}
                    style={styles.modalList}
                    ListEmptyComponent={<ThemedText style={styles.modalEmptyText}>No expenses found for this category.</ThemedText>}
                  />
                </View>
              </View>
              
              {/* Bottom Close Button */}
              <TouchableOpacity 
                onPress={() => {
                  setIsCategoryModalVisible(false);
                  setSelectedCategoryName('');
                  setSelectedCategoryColor('');
                  setSelectedCategoryTextColor('#FFFFFF');
                }}
                style={styles.categoryModalCloseButton}
              >
                <Ionicons name="close-circle" size={36} color={Colors[colorScheme].textSecondary} />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Modal>

        {/* RE-ADD: Exclusion Modal */}
        <Modal
          animationType="slide" // Changed animation type for clarity
          transparent={true}
          visible={isExclusionModalVisible}
          onRequestClose={() => setIsExclusionModalVisible(false)}
          onShow={() => setTempExcludedCategoryIds(excludedCategoryIds)} 
        >
          <View style={styles.modalOverlay}>
            <ThemedView style={styles.exclusionModalView}>
              <ThemedText style={styles.modalTitle}>Select Categories to Exclude</ThemedText>
              <View style={{ flexShrink: 1 }}> 
                <FlatList
                  data={allCategories} // Show all categories
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({ item }) => (
                    <TouchableOpacity 
                      style={styles.checkboxContainer}
                      onPress={() => handleTempCategoryToggle(item.id)} // Use the TEMP handler
                    >
                      <View style={[
                        styles.checkboxBase,
                        // Check against TEMP state for display within modal
                        tempExcludedCategoryIds.includes(item.id) && styles.checkboxChecked 
                      ]}>
                        {/* Check against TEMP state for display within modal */}
                        {tempExcludedCategoryIds.includes(item.id) && 
                          <Ionicons name="checkmark" size={14} color={Colors[colorScheme].background} />
                        }
                      </View>
                      <ThemedText style={styles.checkboxLabel}>{item.name}</ThemedText>
                    </TouchableOpacity>
                  )}
                />
              </View>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, {marginTop: 15}] }
                onPress={applyExclusionsAndClose} // Use the new handler for Done button
              >
                <ThemedText style={styles.buttonText}>Done</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </View>
        </Modal>

    </ScrollView>
  );
  };

  // Clean up any pending animation frames on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Derived values to determine if sides should render (performance optimization)
  const shouldRenderFront = useDerivedValue(() => {
    return flipProgress.value < 0.9; // Only render front if it might be visible
  }, []);
  
  const shouldRenderBack = useDerivedValue(() => {
    return flipProgress.value > 0.1; // Only render back if it might be visible
  }, []);

  // Adjust the bottom tab bar styles for better visibility and touch experience
  const tabBarStyle = useMemo(() => {
    return {
      position: 'absolute' as const,
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: Colors[colorScheme].card,
      borderTopWidth: 1,
      borderTopColor: Colors[colorScheme].border,
      paddingVertical: 8,
      paddingHorizontal: 10,
      flexDirection: 'row' as const,
      justifyContent: 'space-around' as const,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: -1,
      },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 4,
      height: 48,
    };
  }, [colorScheme]);

  // Style for the tab buttons
  const tabButtonStyle = useMemo(() => {
    return {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: 6,
    };
  }, [colorScheme]);

  // Active state style override
  const activeTabStyle = useMemo(() => {
    return {
      borderTopWidth: 2,
      borderTopColor: Colors[colorScheme].primary,
      paddingTop: 4, // Compensate for the border
    };
  }, [colorScheme]);

  // Style for the text in tab buttons
  const tabButtonTextStyle = useMemo(() => {
    return {
      fontSize: 14,
      marginLeft: 6,
      color: Colors[colorScheme].text,
    };
  }, [colorScheme]);

  const scrollViewStyle = useMemo(() => {
    return {
      flex: 1,
      paddingBottom: 50,
    };
  }, []);

  // Fetch All Categories and Gain Category ID once on mount
  useEffect(() => {
    let isMounted = true;
    const fetchAllCategories = async () => {
      try {
        const categories = await getAllCategories();
        if (isMounted) {
          setAllCategories(categories);
        }
      } catch (err) {
        console.error("[Analyzer] Error fetching categories:", err);
        // Handle error appropriately
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    fetchAllCategories();
    return () => { isMounted = false; };
  }, []);

  // --- Handlers for Exclusion Modal ---
  const handleTempCategoryToggle = (categoryId: number) => {
    setTempExcludedCategoryIds(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId) // Remove if present
        : [...prev, categoryId] // Add if not present
    );
  };

  const applyExclusionsAndClose = () => {
    setExcludedCategoryIds(tempExcludedCategoryIds); // Apply the temp selection
    setIsExclusionModalVisible(false); // Close the modal
  };
  // --- End Handlers for Exclusion Modal ---

  return (
    <View style={{flex: 1}}>
      <Stack.Screen options={{ 
        title: 'Monthly Analyzer',
        headerRight: () => (
          <View style={styles.visualIndicatorStyle}>
            <ThemedText style={styles.visualIndicatorTextStyle}>
              {showGainsView ? "Gains" : "Expenses"}
            </ThemedText>
            <View style={[
              styles.activeIndicatorDot, 
              { backgroundColor: Colors[colorScheme].tint }
            ]} />
          </View>
        )
      }} />

      <View style={styles.flipContainer}>
        {/* Front Side - Expenses View (Original) */}
        <Animated.View style={frontAnimatedStyle}>
          <ScrollView 
            style={scrollViewStyle}
            contentContainerStyle={styles.contentContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[Colors[colorScheme].tint]}
                tintColor={Colors[colorScheme].tint}
              />
            }
            removeClippedSubviews={true}
            showsVerticalScrollIndicator={false}
          >
            {renderMonthNavigation()}
            {renderTestDataButton()}
            {renderContent()}
          </ScrollView>
        </Animated.View>

        {/* Back Side - Gains View (Currently a clone) */}
        <Animated.View style={backAnimatedStyle}>
          <ScrollView 
            style={scrollViewStyle}
            contentContainerStyle={styles.contentContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[Colors[colorScheme].tint]}
                tintColor={Colors[colorScheme].tint}
              />
            }
            removeClippedSubviews={true}
            showsVerticalScrollIndicator={false}
          >
            {renderMonthNavigation()}
            <View style={styles.gainsHeader}>
              <ThemedText style={styles.gainsHeaderText}>
                Gains View
              </ThemedText>
              <ThemedText style={styles.gainsSubtext}>
                Income & Investment Analysis
              </ThemedText>
            </View>
            <View>{/* Wrapper View to prevent direct text rendering */}
              {renderContent(true)}
            </View>
          </ScrollView>
        </Animated.View>
      </View>

      {/* Bottom Tab Navigation */}
      <View style={tabBarStyle}>
        <TouchableOpacity
          style={[
            tabButtonStyle,
            !showGainsView ? activeTabStyle : null,
          ]}
          onPress={() => {
            if (showGainsView) {
              handleFlip();
            }
          }}
        >
          <FontAwesome name="credit-card-alt" size={22} color={Colors[colorScheme].text} />
          <ThemedText style={tabButtonTextStyle}>Expenses</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            tabButtonStyle,
            showGainsView ? activeTabStyle : null, // Use showGainsView for active state
          ]}
          onPress={() => {
            if (!showGainsView) {
              handleFlip();
            }
          }}
        >
          <FontAwesome name="money" size={22} color={Colors[colorScheme].text} />
          <ThemedText style={tabButtonTextStyle}>Gains</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Styles function - Add styles for modal
const getStyles = (colorScheme: 'light' | 'dark') => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors[colorScheme].background,
  },
  monthNavigationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors[colorScheme].border,
  },
  monthNavigationButton: {
    padding: 5,
  },
  monthNavigationText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  loader: {
    marginTop: 50,
  },
  errorText: {
    color: Colors[colorScheme].error,
    textAlign: 'center',
    marginTop: 30,
    fontSize: 16,
    paddingHorizontal: 20,
  },
  contentContainer: {
    paddingBottom: 15, // Add padding only at the bottom, sides handled by list
  },
  infoText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    paddingHorizontal: 15, // Add padding if shown outside contentContainer
  },
  summaryBox: {
    borderRadius: 8,
    padding: 15,
    marginVertical: 15,
    marginHorizontal: 15, // Add horizontal margin to align with list padding
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  netAmountRow: {
    marginTop: 5,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors[colorScheme].border,
  },
  summaryLabel: {
    fontSize: 16,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  summaryLabelNet: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  summaryValueNet: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  incomeValue: {
    color: Colors[colorScheme].success,
  },
  expenseValue: {
    color: Colors[colorScheme].error,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors[colorScheme].border,
    marginVertical: 10,
  },
  generateButton: {
    backgroundColor: Colors[colorScheme].tint,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginVertical: 10,
    marginHorizontal: 20,
    alignItems: 'center',
  },
  generateButtonDisabled: {
    backgroundColor: Colors[colorScheme].textSecondary, // Use existing color
  },
  generateButtonText: {
    color: Colors[colorScheme].background,
    fontSize: 16,
    fontWeight: 'bold',
  },
  chartContainer: { 
    paddingHorizontal: 15, // Consistent padding
    borderRadius: 8,
    paddingVertical: 20, // Increased vertical padding
    marginTop: 15,
    marginBottom: 15,
    backgroundColor: Colors[colorScheme].card,
    marginHorizontal: 15, 
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
    color: Colors[colorScheme].text,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15, 
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors[colorScheme].border,
    backgroundColor: Colors[colorScheme].card, 
    borderRadius: 8,
    marginBottom: 8,
    marginHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  categoryIndicator: {
    width: 4,
    height: '80%',
    borderRadius: 2,
    marginRight: 10,
  },
  transactionLeft: {
    flex: 1, // Adjusted flex direction from original fix
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  transactionDetails: {
    flex: 1, 
  },
  transactionCategory: {
    fontSize: 15, 
    fontWeight: '500',
    marginBottom: 2, 
    color: Colors[colorScheme].text,
  },
  transactionReason: {
    fontSize: 12, 
    color: Colors[colorScheme].textSecondary,
  },
  transactionRight: {
    // Removed flexDirection and alignItems from original fix
     alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16, 
    fontWeight: 'bold',
    textAlign: 'right',
  },
  incomeText: {
    color: Colors[colorScheme].success,
  },
  expenseText: {
    color: Colors[colorScheme].error,
  },
  // --- Modal Styles --- 
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Keep dimming
    justifyContent: 'center',
    alignItems: 'center', // Center the wider modal container
    padding: 20, 
  },
  modalContainer: {
    backgroundColor: Colors[colorScheme].background, 
    borderRadius: 10,
    padding: 0, 
    width: '90%',
    height: '70%',
    flexDirection: 'row', 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
    overflow: 'hidden',
  },
  // New style for the area holding header/list
  modalContentArea: {
    flex: 1, // Takes up remaining space
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors[colorScheme].border,
    backgroundColor: Colors[colorScheme].card, 
  },
  modalHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1, // Allow text to take space
    marginRight: 10, // Space before close button
  },
  closeButton: {
    padding: 5, // Make touch target larger
  },
  modalList: {
    flex: 1,
    paddingTop: 8, // Add top padding to prevent overlap with header
  },
  modalEmptyText: {
    textAlign: 'center',
    paddingVertical: 30,
    color: Colors[colorScheme].textSecondary,
    fontSize: 14,
  },
  legendContainer: {
    marginTop: 20,
    paddingHorizontal: 10, // Padding for legend items
    flexDirection: 'row',
    flexWrap: 'wrap', // Allow legend items to wrap
    justifyContent: 'center', // Center wrapped items
    alignItems: 'flex-start',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginRight: 15, // Spacing between items
  },
  legendColorBox: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
    flexShrink: 1, // Allow text to shrink if needed
  },
  // Add Style for Date/Time
  transactionDateTime: {
    fontSize: 11,
    color: Colors[colorScheme].textSecondary,
    marginTop: 3, // Add a small gap
  },
  barTopLabel: { // Extracted style for top label
    color: Colors[colorScheme].textSecondary,
    fontSize: 9, 
    marginBottom: 5,
    textAlign: 'center',
    width: 40, 
  },
  barXLabel: { // Extracted style for X axis label
    color: Colors[colorScheme].textSecondary,
    fontSize: 10 
  },
  // Style for the animated container holding the bar (Updated)
  animatedContainer: {
    width: 60, 
    alignItems: 'center', 
    justifyContent: 'flex-end', 
    // Make padding explicit values for calculation
    paddingBottom: 10, 
    paddingTop: 10, 
    paddingHorizontal: 5,
    borderRightWidth: StyleSheet.hairlineWidth, 
    borderRightColor: Colors[colorScheme].border,
    marginRight: 5, 
  },
  animatedBarLabel: {
    color: Colors[colorScheme].text, // Make current value more prominent
    fontSize: 11, 
    fontWeight: 'bold',
    marginBottom: 4, 
  },
  animatedBar: {
    borderRadius: 4, 
    borderWidth: 2, 
    borderColor: Colors[colorScheme].tint,
    width: 40, // Increase width from default CLONED_BAR_INITIAL_WIDTH for easier grabbing
    minHeight: 40, // Ensure a minimum height for easier touching
  },
  // Add style for max value text
  maxValueText: {
    fontSize: 9,
    color: Colors[colorScheme].textSecondary,
    marginBottom: 2,
  },
  // Updated style for the container holding the bar
  barAreaContainer: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'flex-end', 
    paddingBottom: 10,
    paddingTop: 10,
    paddingHorizontal: 5,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors[colorScheme].border,
    marginRight: 5,
  },
  
  // Add style for the bar's touchable container
  touchableBarContainer: {
    // Make touch area larger than the bar itself
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  
  dragIcon: {
    marginBottom: 2,
  },
  pieChartWrapper: {
    alignItems: 'center', // Center the pie chart within the wrapper
    justifyContent: 'center',
  },
  categoryModalSideContainer: {
    flex: 1,
    flexDirection: 'row',
    height: '100%',
  },
  categoryModalSideBar: {
    width: 60,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  categoryModalSideText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  verticalTextContainer: {
    position: 'absolute',
    transform: [{ rotate: '-90deg' }],
    width: 300,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryModalContent: {
    flex: 1,
  },
  categoryModalCloseButton: {
    position: 'absolute',
    bottom: 15,
    right: 15,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors[colorScheme].card,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5,
    zIndex: 10,
  },
  sectionHeaderContainer: {
    padding: 10,
    backgroundColor: Colors[colorScheme].background,
    borderBottomWidth: 1,
    borderBottomColor: Colors[colorScheme].border,
    marginHorizontal: 6,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 1,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors[colorScheme].text,
    textAlign: 'center',
  },
  flipButton: {
    padding: 8,
    marginRight: 10,
  },
  flipContainer: {
    flex: 1,
    position: 'relative',
  },
  gainsHeader: {
    backgroundColor: Colors[colorScheme].success, // Use success color for gains
    padding: 15,
    marginVertical: 15,
    marginHorizontal: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  gainsHeaderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF', // White text on colored background
  },
  gainsSubtext: {
    fontSize: 14,
    color: '#FFFFFF', // White text on colored background
    opacity: 0.8,
  },
  flipButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flipButtonText: {
    color: Colors[colorScheme].background,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors[colorScheme].border,
  },
  tabButton: {
    flex: 1,
    padding: 10,
    alignItems: 'center',
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors[colorScheme].tint,
  },
  tabButtonText: {
    color: Colors[colorScheme].textSecondary,
    fontSize: 16,
  },
  tabButtonTextActive: {
    color: Colors[colorScheme].tint,
    fontWeight: 'bold',
  },
  activeIndicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 5,
  },
  visualIndicatorStyle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'transparent',
    borderRadius: 15,
    marginRight: 10,
  },
  visualIndicatorTextStyle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  // --- RE-ADD: Styles for Exclusion Modal ---
  exclusionModalView: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: Colors[colorScheme].card,
    borderRadius: 10,
    padding: 20,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
    flexShrink: 1, 
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors[colorScheme].border,
  },
  checkboxBase: {
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors[colorScheme].tint,
    backgroundColor: 'transparent',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: Colors[colorScheme].tint,
  },
  checkboxLabel: {
    fontSize: 16,
    color: Colors[colorScheme].text,
    flexShrink: 1,
  },
  // --- End Exclusion Modal Styles ---
  // --- RE-ADD required styles for the Exclusion modal, reusing from other modals ---
  modalTitle: {
    marginBottom: 20,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors[colorScheme].text,
  },
  modalButton: {
    borderRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 10,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: Colors[colorScheme].primary,
  },
  buttonText: {
    color: Colors[colorScheme].white ?? '#FFFFFF',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
  filterButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  filterButton: {
    backgroundColor: Colors[colorScheme].tint,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  filterButtonText: {
    color: Colors[colorScheme].background,
    fontSize: 14,
    fontWeight: 'bold',
  },
}); 