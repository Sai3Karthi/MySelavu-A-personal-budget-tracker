import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity, Modal, TextInput, Button, Text, Alert, Platform, KeyboardAvoidingView, Pressable, FlatList, LayoutAnimation, UIManager, ActivityIndicator } from 'react-native'; // Added back KeyboardAvoidingView, Pressable (though commented out)
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons'; // For filter icon
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';

import CustomAlert, { AlertButton } from '@/components/ui/CustomAlert'; // Import custom alert
import { getAllBalances, updateBalance, addTransaction, getAllTransactions, deleteTransaction, BalanceType, Transaction, TransactionPaymentMethod, Category, getAllCategories } from '@/lib/database'; // Import DB functions

// Enable LayoutAnimation on Android
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// Removed Filter Types

// --- Add constant for AsyncStorage key ---
const USER_PURPOSE_KEY = '@user_budget_purpose';

export default function BudgetScreen() {
  const router = useRouter(); // Get router instance
  const colorScheme = useColorScheme() ?? 'light'; // Get color scheme here
  const styles = getThemedStyles(colorScheme); // Generate themed styles

  const [gpayBalance, setGpayBalance] = useState<number>(0.0);
  const [cashBalance, setCashBalance] = useState<number>(0.0);
  const [loadingBalances, setLoadingBalances] = useState<boolean>(true);
  
  // --- Modal State ---
  const [modalVisible, setModalVisible] = useState(false);
  const [currentEditingBalanceType, setCurrentEditingBalanceType] = useState<BalanceType | null>(null);
  const [newAmountInput, setNewAmountInput] = useState<string>('');

  // Transaction List State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState<boolean>(true);

  // Transaction Input State
  const [inputAmount, setInputAmount] = useState<string>('');
  const [inputReason, setInputReason] = useState<string>('');
  const [inputPaymentMethod, setInputPaymentMethod] = useState<TransactionPaymentMethod>('gpay');
  const [inputCategoryId, setInputCategoryId] = useState<number | null>(null); // Store category ID

  // State for input section visibility
  const [isInputSectionVisible, setIsInputSectionVisible] = useState(true);

  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertButtons, setAlertButtons] = useState<AlertButton[]>([]);

  // --- Add Transaction Modal State ---
  const [addTransactionModalVisible, setAddTransactionModalVisible] = useState(false);

  // State to hold available categories for pickers
  const [availableCategories, setAvailableCategories] = useState<Category[]>([]);

  // --- Add state for user purpose ---
  const [userPurpose, setUserPurpose] = useState<string | null>(null);

  // Function to fetch balances and categories
  const fetchData = useCallback(async () => {
    console.log('Fetching data (BudgetScreen - Limited)...');
    setLoadingBalances(true);
    setLoadingTransactions(true);
    // Filters are removed from here
    try {
      const results = await Promise.allSettled([
        getAllBalances(),
        // Add limit: 15 to fetch only recent transactions
        getAllTransactions({ limit: 15 }), 
        getAllCategories(), 
      ]);

      // Process Balances
      if (results[0].status === 'fulfilled' && results[0].value) {
        setGpayBalance(results[0].value.gpay);
        setCashBalance(results[0].value.cash);
      } else {
        console.error("Failed to fetch balances:", results[0].status === 'rejected' ? results[0].reason : 'No data');
        showAlert("Error", "Could not load balances.", [{ text: "OK" }]);
      }

      // Process Transactions
      if (results[1].status === 'fulfilled' && results[1].value) {
        setTransactions(results[1].value || []);
      } else {
         console.error("Failed to fetch transactions:", results[1].status === 'rejected' ? results[1].reason : 'No data');
         showAlert("Error", "Could not load transactions.", [{ text: "OK" }]);
         setTransactions([]);
      }
      
      // Process Categories
      let fetchedCategories: Category[] = [];
      if (results[2].status === 'fulfilled' && results[2].value) {
        fetchedCategories = results[2].value || [];
        setAvailableCategories(fetchedCategories);
      } else {
          console.error("Failed to fetch categories:", results[2].status === 'rejected' ? results[2].reason : 'No data');
          showAlert("Error", "Could not load categories for selection.", [{ text: "OK" }]);
          setAvailableCategories([]);
      }

      // Set default input category ID 
      if (inputCategoryId === null && fetchedCategories.length > 0) {
         const uncategorized = fetchedCategories.find(cat => cat.name.toLowerCase() === 'uncategorized');
         const defaultCategory = fetchedCategories.find(cat => cat.name.toLowerCase() !== 'gain'); 
         const gainCategory = fetchedCategories.find(cat => cat.name.toLowerCase() === 'gain');
         
         if (uncategorized) setInputCategoryId(uncategorized.id);
         else if (defaultCategory) setInputCategoryId(defaultCategory.id);
         else if (gainCategory) setInputCategoryId(gainCategory.id);
      }

    } catch (error) { 
      console.error("Unexpected error during fetchData:", error);
      showAlert("Error", `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`, [{ text: "OK" }]);
    } finally {
      setLoadingBalances(false);
      setLoadingTransactions(false);
      console.log('Data fetching complete (BudgetScreen - Limited).');
    }
  // Removed filter dependencies
  }, []); 

  // --- Add useEffect to load purpose on mount ---
  useEffect(() => {
    const loadPurpose = async () => {
      try {
        const storedPurpose = await AsyncStorage.getItem(USER_PURPOSE_KEY);
        if (storedPurpose !== null) {
          setUserPurpose(storedPurpose);
        }
      } catch (e) {
        console.error("Failed to load user purpose from storage", e);
        // Optionally show an alert to the user
      }
    };
    loadPurpose();
  }, []);

  // Fetch data when the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchData(); 
    }, [fetchData]) 
  );

  const formatCurrency = (amount: number) => `₹${amount.toFixed(2)}`;
  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // --- Modal Functions ---
  const openBalanceModal = (type: BalanceType) => {
    setCurrentEditingBalanceType(type);
    const currentAmount = type === 'gpay' ? gpayBalance : cashBalance;
    setNewAmountInput(currentAmount.toString()); 
    setModalVisible(true);
  };

  const handleSaveBalance = async () => {
    if (!currentEditingBalanceType) return;
    const amount = parseFloat(newAmountInput);
    if (isNaN(amount) || amount < 0) {
      showAlert("Invalid Amount", "Please enter a valid positive number.", [{ text: "OK" }]);
      return;
    }
    try {
      const success = await updateBalance(currentEditingBalanceType, amount);
      if (success) {
        await fetchData(); 
        setModalVisible(false);
        setNewAmountInput('');
        setCurrentEditingBalanceType(null);
      } else {
        showAlert("Error", "Failed to update balance.", [{ text: "OK" }]);
      }
    } catch (error) {
      console.error("Error saving balance:", error);
      showAlert("Error", `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`, [{ text: "OK" }]);
    }
  };
  // --- End Modal Functions ---

  // --- Transaction Input Logic ---
  const handleAddNewTransaction = async () => {
    const amount = parseFloat(inputAmount);
    if (isNaN(amount) || amount <= 0) {
      showAlert("Invalid Amount", "Please enter a valid positive amount.", [{ text: "OK" }]);
      return;
    }
     if (inputCategoryId === null) { 
        showAlert("Missing Category", "Please select a category for the transaction.", [{ text: "OK" }]);
        return;
     }
    const transactionData = { amount, reason: inputReason.trim() || undefined, paymentMethod: inputPaymentMethod, categoryId: inputCategoryId };
    try {
      const newTransaction = await addTransaction(transactionData);
      if (newTransaction) {
        setInputAmount('');
        setInputReason('');
        setAddTransactionModalVisible(false); 
        showAlert("Success", "Transaction added.", [{ text: "OK" }]);
        await fetchData(); 
      } else {
        showAlert("Error", "Failed to add transaction. Check balance or category.", [{ text: "OK" }]);
      }
    } catch (error) {
      console.error("Error adding transaction:", error);
      showAlert("Error", `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`, [{ text: "OK" }]);
    }
  };
  // --- End Transaction Input Logic ---

  // --- Transaction Deletion Logic ---
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
                await fetchData(); 
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
  // --- End Deletion Logic ---

  // --- Render Item for Transaction List ---
  const renderTransactionItem = ({ item }: { item: Transaction }) => (
    <TouchableOpacity 
      onLongPress={() => handleDeleteTransaction(item.id, item.reason)}
      delayLongPress={500} 
    >
      <ThemedView style={styles.transactionItem}>
        <View style={styles.transactionDetails}>
          <ThemedText style={styles.transactionReason}>{item.reason || 'No Reason'}</ThemedText>
          <ThemedText style={styles.transactionDate}>{formatDate(item.timestamp)}</ThemedText>
          <View style={styles.transactionTags}>
            <ThemedText style={[styles.tag, styles.tagMethod]}>{item.paymentMethod}</ThemedText>
            <ThemedText style={[styles.tag, item.categoryName?.toLowerCase() === 'gain' ? styles.tagGain : styles.tagExpense]}>
              {item.categoryName || 'Uncategorized'}
            </ThemedText>
          </View>
        </View>
        <ThemedText style={[styles.transactionAmount, item.categoryName?.toLowerCase() === 'gain' ? styles.transactionAmountGain : styles.transactionAmountExpense]}>
          {item.categoryName?.toLowerCase() === 'gain' ? '+' : '-'}{formatCurrency(item.amount)}
        </ThemedText> 
      </ThemedView>
    </TouchableOpacity>
  );
  // --- End Render Item ---

  // --- Custom Alert Helper ---
  const showAlert = (title: string, message: string, buttons: AlertButton[]) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertButtons(buttons);
    setAlertVisible(true);
  };

  const closeAlert = () => setAlertVisible(false);

  // --- Implement Reset Purpose Selection --- 
  const resetPurposeSelection = async () => {
    Alert.alert(
      "Select Budget Purpose",
      "Choose the primary purpose for this budget:",
      [
        {
          text: "Student",
          onPress: async () => {
            setUserPurpose("Student");
            await AsyncStorage.setItem(USER_PURPOSE_KEY, "Student");
          },
        },
        {
          text: "Business",
          onPress: async () => {
            setUserPurpose("Business");
            await AsyncStorage.setItem(USER_PURPOSE_KEY, "Business");
          },
        },
        {
          text: "Personal",
          onPress: async () => {
            setUserPurpose("Personal");
            await AsyncStorage.setItem(USER_PURPOSE_KEY, "Personal");
          },
        },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setUserPurpose(null);
            await AsyncStorage.removeItem(USER_PURPOSE_KEY);
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true } // Allow dismissing by tapping outside
    );
  };
  // --- End Reset Purpose Selection ---

  // --- Navigation Function ---
  const handleViewAllPress = () => {
    router.push('/all-transactions');
  };

  // Calculate total balance
  const totalBalance = gpayBalance + cashBalance;

  // --- Render View All Button (Now in Header) ---
  const renderViewAllButton = () => (
      // No longer conditional on length >= 15
      <TouchableOpacity style={styles.viewAllButton} onPress={handleViewAllPress}>
        <ThemedText type="link" style={styles.viewAllButtonText}>View All</ThemedText>
        <Ionicons name="chevron-forward" size={18} color={Colors[colorScheme].tint} /> 
      </TouchableOpacity>
  );

  return (
    <ThemedView style={styles.outerContainer}> 
      <FlatList
        style={styles.flatListContainer}
        ListHeaderComponent={
          <>
            {/* Balance Box */}
            <ThemedView style={styles.balanceContainer}>
              <TouchableOpacity style={styles.balanceDivision} onPress={() => openBalanceModal('gpay')} >
                <ThemedText style={styles.balanceLabel}>GPay Balance</ThemedText>
                {loadingBalances ? (
                  <ThemedText style={styles.balanceAmount}>Loading...</ThemedText>
                ) : (
                  <ThemedText style={styles.balanceAmount}>{formatCurrency(gpayBalance)}</ThemedText>
                )}
              </TouchableOpacity>
              <View style={styles.balanceDivider} />
              <TouchableOpacity style={styles.balanceDivision} onPress={() => openBalanceModal('cash')} >
                <ThemedText style={styles.balanceLabel}>Cash Balance</ThemedText>
                {loadingBalances ? (
                  <ThemedText style={styles.balanceAmount}>Loading...</ThemedText>
                ) : (
                  <ThemedText style={styles.balanceAmount}>{formatCurrency(cashBalance)}</ThemedText>
                )}
              </TouchableOpacity>
            </ThemedView>
            
            {/* Display User Purpose Below Balances */}
            {userPurpose && (
              <View style={styles.purposeContainer}> 
                <ThemedText style={styles.purposeText}>Purpose: {userPurpose}</ThemedText>
              </View>
            )}
            
            {/* Settings Section */}
            <ThemedView style={styles.settingsContainer}>
              <ThemedText style={styles.settingsHeader}>Settings</ThemedText>
              <TouchableOpacity 
                style={styles.settingsButton}
                onPress={resetPurposeSelection}
              >
                <Ionicons name="refresh-circle-outline" size={20} color={Colors[colorScheme].tint} />
                <ThemedText style={styles.settingsButtonText}>Reset Purpose Selection</ThemedText>
              </TouchableOpacity>
            </ThemedView>
            
            {/* Transaction List Header & View All Button */}
            <ThemedView style={styles.transactionsHeader}>
              <ThemedText type="subtitle">Recent Transactions</ThemedText>
              {/* Move the View All Button Here */}
              {renderViewAllButton()}
            </ThemedView>
            
            {/* REMOVED Filter Section */}
          </>
        }
        data={transactions}
        renderItem={renderTransactionItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={!loadingTransactions ? <ThemedText style={styles.emptyListText}>No transactions yet.</ThemedText> : null}
        // Remove ListFooterComponent
        contentContainerStyle={{ paddingBottom: 80 }} // Add more bottom padding for FAB
      />

      {/* Loading Indicator for transactions */}
      {loadingTransactions && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
          <ThemedText style={styles.loadingText}>Loading...</ThemedText>
        </View>
      )}

      {/* Add Transaction Floating Button - Using Primary Color */}
      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => setAddTransactionModalVisible(true)}
      >
        {/* Icon color remains white, should contrast with primary */}
        <Ionicons name="add" size={30} color={Colors[colorScheme].white ?? '#FFF'} />
      </TouchableOpacity>
      
      {/* Modals */}
      {/* Update Balance Modal - Apply themed styles inside if needed */}
       <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ThemedView style={styles.modalView}>
            <ThemedText style={styles.modalTitle}>
              Update {currentEditingBalanceType === 'gpay' ? 'GPay' : 'Cash'} Balance
            </ThemedText>
            <TextInput
              style={styles.modalInput}
              onChangeText={setNewAmountInput}
              value={newAmountInput}
              placeholder="Enter new amount"
              placeholderTextColor={Colors[colorScheme].textSecondary} // Use theme color
              keyboardType="decimal-pad"
            />
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setModalVisible(false)}>
                 <ThemedText style={styles.buttonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleSaveBalance}>
                 <ThemedText style={styles.buttonText}>Save</ThemedText>
              </TouchableOpacity>
            </View>
          </ThemedView>
        </View>
      </Modal>

      {/* Add Transaction Modal - Apply themed styles inside */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={addTransactionModalVisible}
        onRequestClose={() => setAddTransactionModalVisible(false)}
      >
        <KeyboardAvoidingView /* ... props ... */ style={styles.modalOverlay}>
          {/* Use ThemedView or ensure modalView style uses theme */}
          <ThemedView style={styles.modalView}> 
            <ThemedText style={styles.modalTitle}>Add New Transaction</ThemedText>
            
            <TextInput
              style={styles.modalInput} // Uses themed style
              placeholder="Amount"
              placeholderTextColor={Colors[colorScheme].textSecondary} // Use theme color
              keyboardType="decimal-pad"
              value={inputAmount}
              onChangeText={setInputAmount}
            />
            
            <TextInput
              style={styles.modalInput} // Uses themed style
              placeholder="Reason (Optional)"
              placeholderTextColor={Colors[colorScheme].textSecondary} // Use theme color
              value={inputReason}
              onChangeText={setInputReason}
            />

            {/* Payment Method Selector */}
            <View style={styles.selectorContainerRow}> 
              <ThemedText style={styles.selectorLabel}>Method:</ThemedText> 
              <TouchableOpacity 
                style={[styles.pickerButton, inputPaymentMethod === 'gpay' && styles.pickerButtonSelected]}
                onPress={() => setInputPaymentMethod('gpay')}
              >
                <ThemedText style={[styles.pickerButtonText, inputPaymentMethod === 'gpay' && styles.pickerButtonTextSelected]}>GPay</ThemedText> 
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.pickerButton, inputPaymentMethod === 'cash' && styles.pickerButtonSelected]}
                onPress={() => setInputPaymentMethod('cash')}
              >
                <ThemedText style={[styles.pickerButtonText, inputPaymentMethod === 'cash' && styles.pickerButtonTextSelected]}>Cash</ThemedText>
              </TouchableOpacity>
            </View>

            {/* Category Selector */}
             <ThemedText style={styles.selectorLabel}>Category:</ThemedText>
            <FlatList
              data={availableCategories}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[styles.pickerButton, inputCategoryId === item.id && styles.pickerButtonSelected]}
                  onPress={() => setInputCategoryId(item.id)}
                >
                   <ThemedText style={[styles.pickerButtonText, inputCategoryId === item.id && styles.pickerButtonTextSelected]}>{item.name}</ThemedText>
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.id.toString()}
              horizontal={true} // Keep it horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryPickerContent}
            />
            
            {/* Action Buttons */}
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setAddTransactionModalVisible(false)}
              >
                 <ThemedText style={styles.buttonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.saveButton]} 
                onPress={handleAddNewTransaction}
              >
                 <ThemedText style={styles.buttonText}>Add Transaction</ThemedText>
              </TouchableOpacity>
            </View>
          </ThemedView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Custom Alert */}
      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        buttons={alertButtons}
        onClose={closeAlert} // Ensure onClose is passed
      />
    </ThemedView>
  );
}

// --- Themed Styles Function ---
const getThemedStyles = (scheme: 'light' | 'dark') => StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: Colors[scheme].background,
  },
  flatListContainer: {
    flex: 1,
  },
  balanceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    backgroundColor: Colors[scheme].card, // Use theme card color
    borderRadius: 8,
    marginHorizontal: 15,
    marginTop: 15,
    // Removed shadow for simplicity, add back if needed with theme colors
  },
  balanceDivision: {
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: Colors[scheme].textSecondary,
    marginBottom: 5,
  },
  balanceAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors[scheme].text,
  },
  balanceDivider: {
    width: 1,
    backgroundColor: Colors[scheme].border,
  },
  // --- Add Style for Purpose Display Container ---
  purposeContainer: {
    alignItems: 'center', 
    marginTop: 10, 
    marginBottom: 5,
  },
  purposeText: {
    fontSize: 14,
    color: Colors[scheme].textSecondary,
    fontStyle: 'italic',
  },
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 20, 
    paddingBottom: 10, 
    backgroundColor: Colors[scheme].background, // Match outer background
  },
  transactionItem: {
    // Background handled by ThemedView
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors[scheme].border,
  },
  transactionDetails: {
    flex: 1,
    marginRight: 10,
  },
  transactionReason: { // Style for ThemedText
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 3,
  },
  transactionDate: { // Style for ThemedText
    fontSize: 12,
    marginBottom: 4,
    color: Colors[scheme].textSecondary, // Explicitly set secondary color
  },
  transactionTags: {
    flexDirection: 'row',
    flexWrap: 'wrap', 
  },
  tag: { 
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginRight: 5,
    marginTop: 3, 
    overflow: 'hidden',
    fontWeight: '500', // Make tag text slightly bolder
  },
  tagMethod: {
    backgroundColor: Colors[scheme].tint + '30', 
    color: Colors[scheme].tint, // Ensure text color matches tint
  },
  tagExpense: {
    backgroundColor: Colors[scheme].error + '30', 
    color: Colors[scheme].error, // Ensure text color matches error
  },
  tagGain: {
    backgroundColor: Colors[scheme].success + '30', 
    color: Colors[scheme].success, // Ensure text color matches success
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
  emptyListText: {
    textAlign: 'center',
    marginTop: 30,
    fontSize: 16,
    color: Colors[scheme].textSecondary,
  },
  loadingOverlay: { 
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors[scheme].background + 'aa',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10, 
  },
  loadingText: {
     color: Colors[scheme].text,
     marginTop: 10,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    // Use theme primary color for background
    backgroundColor: Colors[scheme].primary, 
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  
  // --- Moved Modal Styles --- 
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Darker overlay for better contrast
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalView: {
    width: '85%',
    backgroundColor: Colors[scheme].card, // Use theme card color
    borderRadius: 10,
    padding: 20,
    alignItems: 'stretch',
    shadowColor: '#000', // Keep shadow potentially
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    marginBottom: 20, // More space
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors[scheme].text, // Use theme text color
  },
  modalInput: {
    height: 45,
    backgroundColor: Colors[scheme].background, // Use theme background
    borderColor: Colors[scheme].border, // Use theme border
    color: Colors[scheme].text, // Use theme text
    borderWidth: 1,
    borderRadius: 5,
    marginBottom: 15,
    paddingHorizontal: 10,
    fontSize: 16,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15, // More space before buttons
  },
  modalButton: {
    borderRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 10, 
    flex: 1, 
    marginHorizontal: 5, 
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: Colors[scheme].textSecondary, // Use secondary text as grey background
  },
  saveButton: {
    backgroundColor: Colors[scheme].primary, // Use theme primary color
  },
  buttonText: {
    color: Colors[scheme].white ?? '#FFFFFF', // Use theme white text (should contrast with primary/secondary)
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
  selectorContainerRow: {
    flexDirection: 'row',
    alignItems: 'center', 
    marginBottom: 15,
    // justifyContent: 'space-between', // Let content space itself
  },
  selectorLabel: {
    fontSize: 16,
    marginRight: 10,
    color: Colors[scheme].textSecondary, // Use theme secondary text
  },
  pickerButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors[scheme].border, // Use theme border
    backgroundColor: Colors[scheme].background, // Use theme background
    marginRight: 8,
  },
  pickerButtonSelected: {
    borderColor: Colors[scheme].tint, // Use theme tint for selected border
    backgroundColor: Colors[scheme].tint + '20', // Use semi-transparent tint for background
  },
  pickerButtonText: {
    fontSize: 14,
    color: Colors[scheme].text, // Use theme text
  },
  pickerButtonTextSelected: {
     color: Colors[scheme].tint, // Use theme tint for selected text
  },
  categoryPickerContent: {
    paddingVertical: 5, // Add some vertical padding for scroll container
    marginBottom: 15,
  },

  // --- View All Button Styles ---
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5, // Add some padding
  },
  viewAllButtonText: {
    marginRight: 3, // Space between text and icon
    fontSize: 14, // Slightly smaller font
    fontWeight: '500',
    // Color is handled by ThemedText type="link"
  },

  // --- Settings Styles ---
  settingsContainer: {
    marginHorizontal: 15,
    marginTop: 15,
    padding: 15,
    backgroundColor: Colors[scheme].card,
    borderRadius: 8,
  },
  settingsHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors[scheme].text,
    marginBottom: 10,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 5,
  },
  settingsButtonText: {
    marginLeft: 5,
    fontSize: 14,
    color: Colors[scheme].tint,
  },
}); 