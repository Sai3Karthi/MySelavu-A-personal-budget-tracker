import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet, 
  View, 
  TouchableOpacity, 
  TextInput, 
  Text, 
  LayoutAnimation, 
  UIManager, 
  Platform,
  ActivityIndicator,
  Button,
  Modal,
  KeyboardAvoidingView
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SwipeListView } from 'react-native-swipe-list-view';
import { FlatList } from 'react-native';

import CustomAlert, { AlertButton } from '@/components/ui/CustomAlert';
import {
  getAllTransactions, 
  deleteTransaction, 
  Transaction, 
  TransactionPaymentMethod, 
  Category, 
  getAllCategories,
  updateTransaction,
  NewTransactionData
} from '@/lib/database';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// Filter Types (copied from budget.tsx)
// type FilterDateRange = 'all' | 'this_month' | 'last_month';
type FilterPaymentMethod = 'all' | TransactionPaymentMethod;
type FilterCategory = 'all' | string; // Filter by category name

export default function AllTransactionsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const styles = getThemedStyles(colorScheme);

  // Transaction List State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groupedTransactions, setGroupedTransactions] = useState<{[key: string]: Transaction[]}>({});
  const [sections, setSections] = useState<Array<{title: string, data: Transaction[]}>>([]);
  const [loadingTransactions, setLoadingTransactions] = useState<boolean>(true);

  // --- Filter State ---
  const [showFilters, setShowFilters] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'start' | 'end' | null>(null);
  const [datePickerValue, setDatePickerValue] = useState<Date>(new Date());
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<FilterPaymentMethod>('all');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [filterSearchText, setFilterSearchText] = useState<string>('');
  const [availableCategories, setAvailableCategories] = useState<Category[]>([]);

  // --- Edit Modal State ---
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  // Form state specifically for the edit modal
  const [editInputAmount, setEditInputAmount] = useState<string>('');
  const [editInputReason, setEditInputReason] = useState<string>('');
  const [editInputPaymentMethod, setEditInputPaymentMethod] = useState<TransactionPaymentMethod>('gpay');
  const [editInputCategoryId, setEditInputCategoryId] = useState<number | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertButtons, setAlertButtons] = useState<AlertButton[]>([]);

  // Fetch data function (fetches ALL transactions based on filters)
  const fetchData = useCallback(async () => {
    console.log('Fetching data (AllTransactionsScreen)...');
    setLoadingTransactions(true);
    const filters = {
      startDate,
      endDate,
      paymentMethod: filterPaymentMethod,
      category: filterCategory, 
      searchText: filterSearchText.trim(),
    };
    console.log("[FetchData All] Using filters:", filters);
    try {
      const [fetchedTransactions, fetchedCategories] = await Promise.all([
        getAllTransactions(filters), // Fetches sorted by timestamp DESC
        getAllCategories(),
      ]);
      
      setAvailableCategories(fetchedCategories || []);

      // Group transactions by date (YYYY-MM-DD)
      const grouped: {[key: string]: Transaction[]} = {};
      (fetchedTransactions || []).forEach(tx => {
        const txDate = new Date(tx.timestamp);
        // Format date as YYYY-MM-DD for consistent keys
        const dateKey = `${txDate.getFullYear()}-${(txDate.getMonth() + 1).toString().padStart(2, '0')}-${txDate.getDate().toString().padStart(2, '0')}`;
        
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(tx);
      });
      setGroupedTransactions(grouped);

      // Prepare data for SectionList (Sort dates descending)
      const sectionData = Object.keys(grouped)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime()) // Sort keys (dates) descending
        .map(dateKey => ({ 
          title: dateKey, 
          data: grouped[dateKey] // Transactions for that date
        }));
      setSections(sectionData);

    } catch (error) {
      console.error("Error fetching data for All Transactions:", error);
      showAlert("Error", "Could not load transactions or categories.", [{ text: "OK" }]);
      setTransactions([]);
      setAvailableCategories([]);
    } finally {
      setLoadingTransactions(false);
      console.log('Data fetching complete (AllTransactionsScreen).');
    }
  }, [startDate, endDate, filterPaymentMethod, filterCategory, filterSearchText]);

  // Fetch data when the screen comes into focus or filters change
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  // --- Formatting Functions (Update formatDate for headers) ---
  const formatCurrency = (amount: number) => `₹${amount.toFixed(2)}`;
  const formatTimestamp = (timestamp: number) => new Date(timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const formatSectionHeaderDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00'); // Ensure correct parsing
    return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
    });
  };

  // --- Deletion Logic (copied) ---
  const handleDeleteTransaction = (transactionId: string, transactionReason: string | null) => {
    showAlert(
      "Delete Transaction",
      `Are you sure you want to delete this transaction?\nReason: ${transactionReason || 'No Reason'}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", 
          onPress: async () => {
            try {
              const success = await deleteTransaction(transactionId);
              if (success) {
                showAlert("Deleted", "Transaction removed successfully.", [{ text: "OK" }]);
                fetchData(); // Refetch after deletion
              } else {
                showAlert("Error", "Failed to delete transaction.", [{ text: "OK" }]);
              }
            } catch (error) {
              console.error("Error deleting transaction:", error);
              showAlert("Error", `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`, [{ text: "OK" }]);
            }
          }
        }
      ]
    );
  };

  // --- Navigation Handler for Editing (Change to Open Modal) ---
  const handleEditTransaction = (transaction: Transaction) => {
    console.log("Opening edit modal for transaction:", transaction.id);
    setEditingTransaction(transaction);
    // Pre-fill edit form state
    setEditInputAmount(transaction.amount.toString());
    setEditInputReason(transaction.reason || '');
    setEditInputPaymentMethod(transaction.paymentMethod);
    setEditInputCategoryId(transaction.categoryId);
    // Ensure categories are loaded (should be from fetchData)
    // Open modal
    setIsEditModalVisible(true);
  };

  // --- Add Save Handler for Edit Modal ---
  const handleSaveChanges = async () => {
    if (!editingTransaction) return;

    const amount = parseFloat(editInputAmount);
    if (isNaN(amount)) { 
      showAlert("Invalid Amount", "Please enter a valid number.", [{ text: "OK" }]);
      return;
    }
    if (editInputCategoryId === null) {
        showAlert("Missing Category", "Please select a category.", [{ text: "OK" }]);
        return;
    }

    const updatedData: NewTransactionData = { 
      amount,
      reason: editInputReason.trim() || undefined,
      paymentMethod: editInputPaymentMethod,
      categoryId: editInputCategoryId 
    };

    setIsSavingEdit(true);
    try {
      // Ensure updateTransaction is imported from @/lib/database
      const success = await updateTransaction(editingTransaction.id, updatedData);
      if (success) {
        setIsEditModalVisible(false);
        setEditingTransaction(null); // Clear editing state
        showAlert("Success", "Transaction updated.", [{ text: "OK" }]);
        fetchData(); // Refresh the list
      } else {
        showAlert("Error", "Failed to update transaction.", [{ text: "OK" }]);
      }
    } catch (err: any) {
      console.error("Error saving transaction edit:", err);
      showAlert("Error", `Save failed: ${err.message || String(err)}`, [{ text: "OK" }]);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // --- Render Item (REMOVE TouchableOpacity wrapper, add isHeader check) ---
  const renderTransactionItem = ({ item }: { item: Transaction | { type: 'header', title: string } }) => {
    // Check if it's a header item
    if ('type' in item && item.type === 'header') {
      return renderSectionHeader({ section: { title: item.title, data: [] } }); // Reuse existing header render logic
    }
    
    // It's a transaction item
    const transaction = item as Transaction;
    return (
      // No TouchableOpacity needed here anymore
      <ThemedView style={styles.transactionItem}>
        <View style={styles.transactionLeft}>
          <Ionicons 
            name={transaction.paymentMethod === 'cash' ? 'wallet-outline' : 'card-outline'} 
            size={24} 
            color={Colors[colorScheme].textSecondary}
            style={styles.paymentIcon}
          />
          <View style={styles.transactionDetails}>
            <ThemedText style={styles.transactionReason} numberOfLines={1}>{transaction.reason || 'No Reason'}</ThemedText>
            <ThemedText style={styles.transactionDate} numberOfLines={1}>{formatTimestamp(transaction.timestamp)}</ThemedText>
            <ThemedText style={[
              styles.tag, 
              styles.tagBase,
              transaction.paymentMethod === 'cash' ? styles.tagCash : styles.tagGPay
            ]}>
              {transaction.paymentMethod === 'cash' ? 'Cash' : 'GPay'}
            </ThemedText>
          </View>
        </View>
        <View style={styles.transactionRight}>
            <ThemedText style={[
                styles.transactionAmount, 
                transaction.categoryName?.toLowerCase() === 'gain' ? styles.transactionAmountGain : styles.transactionAmountExpense
            ]}>
              {transaction.categoryName?.toLowerCase() === 'gain' ? '+' : '-'}{formatCurrency(transaction.amount)}
            </ThemedText> 
            <ThemedText style={styles.transactionCategoryName} numberOfLines={1}>
              {transaction.categoryName || 'Uncategorized'}
            </ThemedText>
        </View>
      </ThemedView>
    );
  };

  // --- Render Hidden Buttons ---
  const renderHiddenItem = (data: any, rowMap: any) => {
    if ('type' in data.item && data.item.type === 'header') {
      return null;
    }
    const transaction = data.item as Transaction;
    return (
      <View style={styles.rowBack}>
        {/* Edit Button (Left) */}
        <TouchableOpacity
          style={styles.backLeftBtnLeft}
          onPress={() => handleEditTransaction(transaction)}
        >
          <Ionicons name="pencil-outline" size={25} color={Colors[colorScheme].white} />
          <Text style={styles.backTextWhite}>Edit</Text>
        </TouchableOpacity>

        {/* Delete Button (Right) */}
        <TouchableOpacity
          style={styles.backRightBtnRight}
          onPress={() => handleDeleteTransaction(transaction.id, transaction.reason)}
        >
          <Ionicons name="trash-bin-outline" size={25} color={Colors[colorScheme].white} />
          <Text style={styles.backTextWhite}>Delete</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // --- Render Section Header (remains mostly the same) ---
  const renderSectionHeader = ({ section }: { section: { title: string; data: Transaction[] } }) => (
    <ThemedView style={styles.sectionHeader}>
      <ThemedText style={styles.sectionHeaderText}>
        {formatSectionHeaderDate(section.title)}
      </ThemedText>
    </ThemedView>
  );

  // --- Alert Helpers (copied) ---
  const showAlert = (title: string, message: string, buttons: AlertButton[]) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertButtons(buttons);
    setAlertVisible(true);
  };
  const closeAlert = () => setAlertVisible(false);

  // --- Filter Logic (copied) ---
  const applyFilters = () => {
      console.log("Applying filters (All Transactions)...");
      fetchData(); // Refetch with current filter state
  };

  // Clear all filters
  const clearFilters = () => {
    setStartDate(null);
    setEndDate(null);
    setFilterPaymentMethod('all');
    setFilterCategory('all');
    setFilterSearchText('');
    // Update data with cleared filters
    fetchData();
  };

  const toggleFilterSection = () => {
    // Temporarily remove LayoutAnimation to test for native driver conflicts
    // LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowFilters(!showFilters);
  };

  // Date picker functions
  const showDatepickerFor = (target: 'start' | 'end') => {
    setDatePickerTarget(target);
    // Set initial date based on current selection or today
    setDatePickerValue(target === 'start' ? startDate || new Date() : endDate || new Date());
    setShowDatePicker(true);
  };

  const onChangeDatePicker = (event: DateTimePickerEvent, selectedDate?: Date) => {
    const currentDate = selectedDate || datePickerValue;
    setShowDatePicker(false);
    
    if (event.type === 'set' && selectedDate) {
      if (datePickerTarget === 'start') {
        setStartDate(currentDate);
      } else if (datePickerTarget === 'end') {
        setEndDate(currentDate);
      }
    }
    
    setDatePickerTarget(null);
  };

  // Format date helper for consistent display
  const formatDateForDisplay = (date: Date | null) => {
    if (!date) return null;
    return date.toLocaleDateString();
  };

  // --- Render Filter Section (Updated for Date Pickers) ---
  const renderFilterSection = () => (
    <ThemedView style={styles.filterContainer}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search transactions..."
        placeholderTextColor={Colors[colorScheme].textSecondary}
        value={filterSearchText}
        onChangeText={setFilterSearchText}
      />

      {/* Date Range Pickers */}
      <View style={styles.datePickerRow}>
        <TouchableOpacity 
          style={styles.datePickerButton} 
          onPress={() => showDatepickerFor('start')}
        >
          <Ionicons name="calendar-outline" size={18} color={Colors[colorScheme].tint} style={{marginRight: 5}} />
          <ThemedText style={styles.datePickerButtonText}> 
              {formatDateForDisplay(startDate) || 'Start Date'}
          </ThemedText>
        </TouchableOpacity>
        
        <ThemedText style={styles.datePickerSeparator}>to</ThemedText>
        
        <TouchableOpacity 
          style={styles.datePickerButton} 
          onPress={() => showDatepickerFor('end')}
        >
          <Ionicons name="calendar-outline" size={18} color={Colors[colorScheme].tint} style={{marginRight: 5}} />
          <ThemedText style={styles.datePickerButtonText}>
              {formatDateForDisplay(endDate) || 'End Date'}
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Payment Method Filter */}
      <ThemedText style={styles.filterGroupLabel}>Payment Method:</ThemedText>
      <View style={styles.filterButtonGroup}>
        {(['all', 'gpay', 'cash'] as FilterPaymentMethod[]).map(method => (
          <TouchableOpacity
            key={method}
            style={[
              styles.filterOptionButton,
              filterPaymentMethod === method && styles.filterOptionButtonActive
            ]}
            onPress={() => setFilterPaymentMethod(method)}
          >
            <ThemedText 
              style={[
                styles.filterOptionButtonText,
                filterPaymentMethod === method && styles.filterOptionButtonTextActive
              ]}
            >
              {method.replace(/\b\w/g, l => l.toUpperCase())}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {/* Category Filter */}
      <ThemedText style={styles.filterGroupLabel}>Category:</ThemedText>
      <View style={styles.filterButtonGroup}>
        <TouchableOpacity
          key="all-cat"
          style={[
            styles.filterOptionButton,
            filterCategory === 'all' && styles.filterOptionButtonActive
          ]}
          onPress={() => setFilterCategory('all')}
        >
          <ThemedText 
            style={[
              styles.filterOptionButtonText,
              filterCategory === 'all' && styles.filterOptionButtonTextActive
            ]}
          >
            All
          </ThemedText>
        </TouchableOpacity>
        {availableCategories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.filterOptionButton,
              filterCategory === cat.name && styles.filterOptionButtonActive
            ]}
            onPress={() => setFilterCategory(cat.name)}
          >
            <ThemedText 
              style={[
                styles.filterOptionButtonText,
                filterCategory === cat.name && styles.filterOptionButtonTextActive
              ]}
            >
              {cat.name}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filter Action Buttons */}
      <View style={styles.filterActionRow}>
        <TouchableOpacity style={[styles.filterActionButton, styles.applyButton]} onPress={fetchData}>
          <ThemedText style={styles.filterActionButtonText}>Apply Filters</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterActionButton, styles.clearButton]} onPress={clearFilters}>
          <ThemedText style={styles.filterActionButtonText}>Clear</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Native Date Picker modal */}
      {showDatePicker && (
        <DateTimePicker
          value={datePickerValue}
          mode="date"
          display="default"
          onChange={onChangeDatePicker}
          // Use themed styling where possible
          textColor={Colors[colorScheme].text}
          accentColor={Colors[colorScheme].tint}
          // Add more styling props as available
        />
      )}
    </ThemedView>
  );

  // --- Flattened data for SwipeListView ---
  const flatData = useMemo(() => {
    const data: Array<Transaction | { type: 'header', title: string }> = [];
    sections.forEach(section => {
      // Add header marker
      data.push({ type: 'header', title: section.title });
      // Add transactions for that section
      data.push(...section.data);
    });
    return data;
  }, [sections]);

  return (
    <ThemedView style={styles.outerContainer}>
      <Stack.Screen options={{ title: 'All Transactions' }} />
      
      {/* Use SwipeListView */}
      <SwipeListView
        style={styles.flatListContainer} // Reuse existing style
        data={flatData} // Use flattened data
        renderItem={renderTransactionItem} // Render visible item (handles headers too)
        renderHiddenItem={renderHiddenItem} // Render the edit/delete buttons
        keyExtractor={(item, index) => ('id' in item ? item.id : `header-${item.title}-${index}`)}
        leftOpenValue={75} // Allow swipe right
        rightOpenValue={-75} // Keep swipe left for delete
        previewRowKey={flatData.length > 1 && 'id' in flatData[1] ? flatData[1].id : undefined} 
        previewOpenValue={-40}
        previewOpenDelay={1000}
        useNativeDriver={false} // Ensure this is false
        ListHeaderComponent={
          // Keep ListHeaderComponent for filters
          <>
            <ThemedView style={styles.listHeaderContainer}> 
              <ThemedText type="subtitle">Transaction History</ThemedText>
              <TouchableOpacity onPress={toggleFilterSection} style={styles.filterToggleButton}>
                  <Ionicons name={showFilters ? "chevron-up-outline" : "options-outline"} size={24} color={Colors[colorScheme].tint} />
              </TouchableOpacity>
            </ThemedView>
            {showFilters && renderFilterSection()}
          </>
        }
        ListEmptyComponent={!loadingTransactions ? <ThemedText style={styles.emptyListText}>No transactions match the current filters.</ThemedText> : null}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      {/* Loading Indicator overlay */}
      {loadingTransactions && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
          <ThemedText style={styles.loadingText}>Loading...</ThemedText>
        </View>
      )}

      {/* Custom Alert */}
      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        buttons={alertButtons}
        onClose={closeAlert}
      />

      {/* --- Add Edit Transaction Modal --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => {
          if (!isSavingEdit) {
            setIsEditModalVisible(false);
            setEditingTransaction(null);
          }
        }}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"} 
          style={styles.modalOverlay}
          keyboardVerticalOffset={60} // Adjust if needed
        >
          <ThemedView style={styles.modalView}> 
            <ThemedText style={styles.modalTitle}>Edit Transaction</ThemedText>
            
            {/* Re-use modalInput style */}
            <TextInput
              style={styles.modalInput} 
              placeholder="Amount"
              placeholderTextColor={Colors[colorScheme].textSecondary} 
              keyboardType="decimal-pad"
              value={editInputAmount}
              onChangeText={setEditInputAmount}
            />
            
            <TextInput
              style={styles.modalInput} 
              placeholder="Reason (Optional)"
              placeholderTextColor={Colors[colorScheme].textSecondary}
              value={editInputReason}
              onChangeText={setEditInputReason}
            />

            {/* Re-use selector styles */}
            <View style={styles.selectorContainerRow}> 
              <ThemedText style={styles.selectorLabel}>Method:</ThemedText> 
              <TouchableOpacity 
                style={[styles.pickerButton, editInputPaymentMethod === 'gpay' && styles.pickerButtonSelected]}
                onPress={() => setEditInputPaymentMethod('gpay')}
              >
                <ThemedText style={[styles.pickerButtonText, editInputPaymentMethod === 'gpay' && styles.pickerButtonTextSelected]}>GPay</ThemedText> 
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.pickerButton, editInputPaymentMethod === 'cash' && styles.pickerButtonSelected]}
                onPress={() => setEditInputPaymentMethod('cash')}
              >
                <ThemedText style={[styles.pickerButtonText, editInputPaymentMethod === 'cash' && styles.pickerButtonTextSelected]}>Cash</ThemedText>
              </TouchableOpacity>
            </View>

            <ThemedText style={styles.selectorLabel}>Category:</ThemedText>
            <FlatList
              data={availableCategories}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[styles.pickerButton, editInputCategoryId === item.id && styles.pickerButtonSelected]}
                  onPress={() => setEditInputCategoryId(item.id)}
                >
                    <ThemedText style={[styles.pickerButtonText, editInputCategoryId === item.id && styles.pickerButtonTextSelected]}>{item.name}</ThemedText>
                </TouchableOpacity>
              )}
              keyExtractor={(item: Category) => item.id.toString()}
              horizontal={true}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryPickerContent}
            />
            
            {/* Re-use modalButtonContainer and button styles */}
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setIsEditModalVisible(false);
                  setEditingTransaction(null);
                }}
                disabled={isSavingEdit}
              >
                 <ThemedText style={styles.buttonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.saveButton, isSavingEdit && styles.disabledButton]} 
                onPress={handleSaveChanges}
                disabled={isSavingEdit}
              >
                 {isSavingEdit ? (
                   <ActivityIndicator size="small" color={Colors[colorScheme].white} />
                 ) : (
                   <ThemedText style={styles.buttonText}>Save Changes</ThemedText>
                 )}
              </TouchableOpacity>
            </View>
          </ThemedView>
        </KeyboardAvoidingView>
      </Modal>
      {/* --- End Edit Transaction Modal --- */}

    </ThemedView>
  );
}

// --- Themed Styles Function ---
const getThemedStyles = (scheme: 'light' | 'dark') => StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: Colors[scheme].background, // Use theme background
  },
  flatListContainer: {
    flex: 1,
  },
  listHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors[scheme].border, // Use theme border
    backgroundColor: Colors[scheme].card, // Use theme card background
  },
  filterToggleButton: {
     padding: 5,
  },
  filterSection: {
    // backgroundColor: Colors[scheme].card, // Handled by ThemedView
    padding: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors[scheme].border,
  },
  searchBar: {
    backgroundColor: Colors[scheme].background, // Use theme background (or a slightly different shade)
    color: Colors[scheme].text, // Use theme text
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10, 
    fontSize: 15,
    marginBottom: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors[scheme].border, 
  },
  filterGroupLabel: {
    color: Colors[scheme].textSecondary, // Use theme secondary text
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  filterButtonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap', 
    marginBottom: 15,
  },
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: Colors[scheme].background, // Default background
    marginRight: 8,
    marginBottom: 8, 
    borderWidth: 1,
    borderColor: Colors[scheme].border, // Default border
  },
  filterButtonActive: {
    backgroundColor: Colors[scheme].tint, // Active background
    borderColor: Colors[scheme].tint, 
  },
  filterButtonText: {
    color: Colors[scheme].text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  filterButtonTextActive: {
     color: Colors[scheme].background, // Text color when active (e.g., white on tint background)
  },
  filterActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end', 
      marginTop: 5,
  },
  filterActionButton: {
      paddingVertical: 10, // Increased padding
      paddingHorizontal: 20,
      borderRadius: 8,
      marginLeft: 10,
  },
  clearButton: {
      backgroundColor: Colors[scheme].textSecondary, // Use secondary text as background for grey
  },
  applyButton: {
      backgroundColor: Colors[scheme].tint, // Use theme tint
  },
  filterActionButtonText: {
      color: Colors[scheme].white ?? '#FFFFFF', // Ensure white text
      fontSize: 14,
      fontWeight: 'bold',
  },
  sectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: Colors[scheme].background, // Use background color
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth, // Add top border too
    borderColor: Colors[scheme].border,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors[scheme].textSecondary,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors[scheme].border,
    backgroundColor: Colors[scheme].card, // Use card for item background
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1, // Take up available space
    marginRight: 10,
  },
  paymentIcon: {
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1, // Allow details to shrink/grow
  },
  transactionReason: { 
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  transactionDate: { 
    fontSize: 12,
    color: Colors[scheme].textSecondary,
  },
  transactionRight: {
     alignItems: 'flex-end', // Align amount and category to the right
  },
  transactionAmount: { 
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2, // Space between amount and category
  },
  transactionCategoryName: { // Style for category name below amount
     fontSize: 12,
     color: Colors[scheme].textSecondary,
  },
  transactionAmountExpense: {
    color: Colors[scheme].error,
  },
  transactionAmountGain: {
    color: Colors[scheme].success,
  },
  emptyListText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: Colors[scheme].textSecondary, // Use theme secondary text
  },
  loadingOverlay: { 
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors[scheme].background + 'aa', // Semi-transparent theme background
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10, 
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: Colors[scheme].text, // Use theme text
  },
  datePickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors[scheme].background,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors[scheme].border,
  },
  datePickerButtonText: {
    color: Colors[scheme].text,
    fontSize: 14,
  },
  tag: { // Base text style for tags
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tagBase: { // Base background/padding/margin for tags
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12, // Rounded tag
    overflow: 'hidden', // Clip background
    alignSelf: 'flex-start', // Ensure tag doesn't stretch
    marginTop: 4, // Add margin top
  },
  tagCash: { // Specific style for Cash tag
    backgroundColor: Colors[scheme].success,
    color: Colors[scheme].white ?? '#FFF', // White text on success color
  },
  tagGPay: { // Specific style for GPay tag
    backgroundColor: Colors[scheme].tint, // Use tint color for GPay
    // Use white text in light mode, dark text in dark mode (since tint is white)
    color: scheme === 'dark' ? Colors[scheme].background : Colors[scheme].white ?? '#FFF', 
  },
  datePickerSeparator: {
    marginHorizontal: 8,
    color: Colors[scheme].textSecondary,
  },
  filterContainer: {
    padding: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors[scheme].border,
  },
  searchInput: {
    backgroundColor: Colors[scheme].background,
    color: Colors[scheme].text,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors[scheme].border,
  },
  filterActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 5,
  },
  clearButtonText: {
    color: Colors[scheme].textSecondary,
    fontSize: 14,
  },
  filterOptionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: Colors[scheme].background,
    marginRight: 8,
    marginBottom: 8,
  },
  filterOptionButtonActive: {
    backgroundColor: Colors[scheme].tint,
    borderColor: Colors[scheme].tint,
  },
  filterOptionButtonText: {
    color: Colors[scheme].text,
    fontSize: 13,
  },
  filterOptionButtonTextActive: {
    color: Colors[scheme].background,
  },
  rowBack: {
    alignItems: 'center',
    backgroundColor: Colors[scheme].background, // Match item background or specific color
    flex: 1,
    flexDirection: 'row',
  },
  backLeftBtnLeft: {
    backgroundColor: Colors[scheme].primary, 
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 75, // Explicit width
    justifyContent: 'center',
    alignItems: 'center',
  },
  backRightBtnRight: {
    backgroundColor: Colors[scheme].error,
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 75, // Explicit width
    justifyContent: 'center',
    alignItems: 'center',
  },
  backTextWhite: {
    color: Colors[scheme].white ?? '#FFF',
    fontSize: 12, 
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalView: {
    width: '85%',
    backgroundColor: Colors[scheme].card,
    borderRadius: 10,
    padding: 20,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    marginBottom: 20,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors[scheme].text,
  },
  modalInput: {
    height: 45,
    backgroundColor: Colors[scheme].background,
    borderColor: Colors[scheme].border,
    color: Colors[scheme].text,
    borderWidth: 1,
    borderRadius: 8, // Match other inputs
    marginBottom: 15,
    paddingHorizontal: 15, // Match other inputs
    fontSize: 16,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 25,
  },
  modalButton: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 10, 
    flex: 1, 
    marginHorizontal: 5, 
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 45,
  },
  cancelButton: {
    backgroundColor: Colors[scheme].textSecondary,
  },
  saveButton: {
    backgroundColor: Colors[scheme].primary,
  },
  disabledButton: {
    backgroundColor: Colors[scheme].textSecondary, // Use secondary for disabled
  },
  buttonText: {
    color: Colors[scheme].white ?? '#FFFFFF', 
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
  selectorContainerRow: {
    flexDirection: 'row',
    alignItems: 'center', 
    marginBottom: 15,
  },
  selectorLabel: {
    fontSize: 16,
    marginRight: 10,
    color: Colors[scheme].textSecondary,
  },
  pickerButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors[scheme].border,
    backgroundColor: Colors[scheme].background,
    marginRight: 8,
  },
  pickerButtonSelected: {
    borderColor: Colors[scheme].tint, 
    backgroundColor: Colors[scheme].tint + '20',
  },
  pickerButtonText: {
    fontSize: 14,
    color: Colors[scheme].text,
  },
  pickerButtonTextSelected: {
      color: Colors[scheme].tint,
  },
  categoryPickerContent: {
    paddingVertical: 5,
    marginBottom: 15,
  },
}); 