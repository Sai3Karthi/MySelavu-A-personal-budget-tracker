import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, FlatList, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { getAllTransactions, Transaction } from '@/lib/database';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Ionicons } from '@expo/vector-icons'; // For icons in transaction item

// Helper to format timestamp
const formatTimestamp = (timestamp: number) => 
  new Date(timestamp).toLocaleDateString('en-GB', { 
    day: '2-digit', month: 'short', year: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  });

// Helper to format currency
const formatCurrency = (amount: number) => `₹${amount.toFixed(2)}`;

export default function DayTransactionsScreen() {
  const params = useLocalSearchParams<{ year?: string; month?: string; day?: string }>();
  const colorScheme = useColorScheme() ?? 'light';
  const styles = getThemedStyles(colorScheme);

  console.log('[DayTransactions] Screen loaded. Params:', params);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const year = params.year ? parseInt(params.year, 10) : null;
  const month = params.month ? parseInt(params.month, 10) : null;
  const day = params.day ? parseInt(params.day, 10) : null;

  const isValidDate = year !== null && month !== null && day !== null && 
                      !isNaN(year) && !isNaN(month) && !isNaN(day);

  // Format date for title
  const screenTitleDate = isValidDate 
    ? new Date(year, month - 1, day).toLocaleDateString('en-US', { 
        year: 'numeric', month: 'long', day: 'numeric' 
      }) 
    : 'Transactions';

  const fetchData = useCallback(async () => {
    if (!isValidDate) {
      setError("Invalid date parameters provided.");
      setIsLoading(false);
      return;
    }
    
    console.log(`Fetching transactions for ${year}-${month}-${day}`);
    setIsLoading(true);
    setError(null);

    try {
      // Calculate start and end timestamps for the specific day
      const startDate = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
      const endDate = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
      
      const fetchedTransactions = await getAllTransactions({ 
        startDate: startDate,
        endDate: endDate
      });
      setTransactions(fetchedTransactions || []);
    } catch (err: any) {
      console.error("Error fetching day transactions:", err);
      setError("Failed to load transactions.");
    } finally {
      setIsLoading(false);
    }
  }, [year, month, day, isValidDate]);

  // Fetch data when the screen comes into focus or params change
  useFocusEffect(fetchData);

  // Re-use a similar transaction item renderer (simplified)
  const renderTransactionItem = ({ item }: { item: Transaction }) => (
    <ThemedView style={styles.transactionItem}>
      <View style={styles.transactionLeft}>
        <Ionicons 
          name={item.paymentMethod === 'cash' ? 'wallet-outline' : 'card-outline'} 
          size={24} 
          color={Colors[colorScheme].textSecondary}
          style={styles.paymentIcon}
        />
        <View style={styles.transactionDetails}>
          <ThemedText style={styles.transactionReason} numberOfLines={1}>{item.reason || 'No Reason'}</ThemedText>
          <ThemedText style={styles.transactionDate} numberOfLines={1}>{formatTimestamp(item.timestamp)}</ThemedText>
          <ThemedText style={styles.transactionCategoryName} numberOfLines={1}>{item.categoryName || 'Uncategorized'}</ThemedText>
        </View>
      </View>
      <View style={styles.transactionRight}>
          <ThemedText style={[
              styles.transactionAmount, 
              item.categoryName?.toLowerCase() === 'gain' ? styles.transactionAmountGain : styles.transactionAmountExpense
          ]}>
            {item.categoryName?.toLowerCase() === 'gain' ? '+' : '-'}{formatCurrency(item.amount)}
          </ThemedText> 
      </View>
    </ThemedView>
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: `Transactions - ${screenTitleDate}` }} />

      {isLoading ? (
        <ActivityIndicator style={styles.loader} size="large" color={Colors[colorScheme].tint} />
      ) : error ? (
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      ) : (
        <FlatList
          data={transactions}
          renderItem={renderTransactionItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<ThemedText style={styles.emptyListText}>No transactions found for this day.</ThemedText>}
          contentContainerStyle={styles.listContentContainer}
        />
      )}
    </ThemedView>
  );
}

const getThemedStyles = (scheme: 'light' | 'dark') => StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
    padding: 20,
    fontSize: 16,
    color: Colors[scheme].error,
  },
  emptyListText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: Colors[scheme].textSecondary,
  },
  listContentContainer: {
    paddingVertical: 10,
  },
  // Copied and potentially simplified from all-transactions.tsx
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors[scheme].border,
    backgroundColor: Colors[scheme].card, // Explicit background for items
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1, // Allow text to take space
    marginRight: 10,
  },
  paymentIcon: {
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1, // Allow text to shrink/grow
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionReason: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 3,
  },
  transactionDate: {
    fontSize: 12,
    color: Colors[scheme].textSecondary,
    marginBottom: 3,
  },
  transactionCategoryName: {
    fontSize: 12,
    color: Colors[scheme].textSecondary,
    fontStyle: 'italic',
  },
  transactionAmount: { 
    fontSize: 16,
    fontWeight: 'bold',
  },
  transactionAmountExpense: {
    color: Colors[scheme].error,
  },
  transactionAmountGain: {
    color: Colors[scheme].success,
  },
}); 