import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { getAllCategories, Category, deleteCategory, addCategory, updateCategory } from '@/lib/database';
import CategoryModal from '@/components/modals/CategoryModal';
import CustomAlert, { AlertButton } from '@/components/ui/CustomAlert';

// TODO: Create Add/Edit Category Modal Component

export default function ManageCategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Modal State ---
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  // ---

  // --- Custom Alert State ---
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertButtons, setAlertButtons] = useState<AlertButton[]>([]);
  // ---

  // Function to show custom alert
  const showAlert = (title: string, message: string, buttons: AlertButton[]) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertButtons(buttons);
    setAlertVisible(true);
  };

  const fetchCategories = useCallback(async () => {
    console.log("[ManageCategories] Fetching categories...");
    setLoading(true);
    try {
      const fetchedCategories = await getAllCategories();
      setCategories(fetchedCategories || []);
      console.log(`[ManageCategories] Fetched ${fetchedCategories?.length ?? 0} categories.`);
    } catch (error) {
      console.error("[ManageCategories] Failed to load categories:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      // Use custom alert
      showAlert("Error Loading Categories", errorMessage, [{ text: "OK" }]); 
    } finally {
      setLoading(false);
    }
  }, []);

  // Corrected useFocusEffect pattern for async functions
  useFocusEffect(
    useCallback(() => {
      async function performFetch() {
        await fetchCategories();
      }
      performFetch();
    }, [fetchCategories])
  );

  const openAddModal = () => {
    setEditingCategory(null);
    setIsModalVisible(true);
  };

  const openEditModal = (category: Category) => {
    if (category.name.toLowerCase() === 'uncategorized' || category.name.toLowerCase() === 'gain') {
        // Use custom alert
        showAlert("Cannot Edit", `The default '${category.name}' category cannot be fully edited.`, [{ text: "OK" }]); 
        return;
    }
    setEditingCategory(category);
    setIsModalVisible(true);
  };

  // --- Handle Save (Add or Update) ---
  const handleSaveCategory = async (categoryData: { id?: number; name: string; limit: number | null }): Promise<boolean> => {
    try {
      let successResult: Category | null | boolean = false; // Adjust type, assuming functions return Category or null/boolean
      let alertInfo = { title: '', message: '' };

      if (editingCategory) {
        // Update existing category
        console.log(`[ManageCategories] Updating category ID: ${editingCategory.id}`, categoryData);
        // Pass arguments individually
        successResult = await updateCategory(
            editingCategory.id, 
            categoryData.name,
            categoryData.limit
        );
        const success = !!successResult; // Check if result is truthy
        alertInfo.title = success ? "Success" : "Error";
        alertInfo.message = success ? `Category "${categoryData.name}" updated.` : `Failed to update category "${categoryData.name}". Name might already exist.`;
      } else {
        // Add new category
        console.log("[ManageCategories] Adding new category", categoryData.name, categoryData.limit);
        successResult = await addCategory(categoryData.name, categoryData.limit); 
        const success = !!successResult; // Check if result is truthy
        alertInfo.title = success ? "Success" : "Error";
        alertInfo.message = success ? `Category "${categoryData.name}" added.` : `Failed to add category "${categoryData.name}". Name might already exist.`;
      }
      
      showAlert(alertInfo.title, alertInfo.message, [{ text: "OK" }]); // Show alert regardless of success/fail

      if (successResult) { // Check if the operation returned a truthy value
        await fetchCategories(); // Refresh the list on success
        return true;
      }
      return false;
    } catch (error) {
      console.error("[ManageCategories] Error saving category:", error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      let displayMessage = message;
      // Check for unique constraint error specifically
      if (message.toLowerCase().includes('unique constraint')) {
          displayMessage = `Category name "${categoryData.name}" already exists.`;
      }
      // Use custom alert
      showAlert("Save Error", displayMessage, [{ text: "OK" }]); 
      return false;
    }
  };

  const handleDelete = (category: Category) => {
    if (category.name.toLowerCase() === 'uncategorized' || category.name.toLowerCase() === 'gain') {
        // Use custom alert
        showAlert("Cannot Delete", "The default 'Uncategorized' and 'Gain' categories cannot be deleted.", [{ text: "OK" }]); 
        return;
    }
    // Use custom alert for confirmation
    showAlert(
        "Delete Category",
        `Are you sure you want to delete "${category.name}"? \nNOTE: This will fail if transactions are using this category.`, 
        [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    try { // Add try/catch around delete operation
                        const success = await deleteCategory(category.id);
                        if (success) {
                            // Use custom alert
                            showAlert("Success", `Category "${category.name}" deleted.`, [{ text: "OK" }]); 
                            fetchCategories(); // Refresh list
                        } else {
                             // Use custom alert
                            showAlert("Error", `Failed to delete category "${category.name}". It might be in use by transactions or already deleted.`, [{ text: "OK" }]);
                        }
                    } catch (deleteError) {
                        console.error("[ManageCategories] Error during delete operation:", deleteError);
                        const message = deleteError instanceof Error ? deleteError.message : "An unexpected error occurred.";
                        // Use custom alert
                        showAlert("Delete Error", message, [{ text: "OK" }]);
                    }
                }
            }
        ]
    );
  };

  const renderCategoryItem = ({ item }: { item: Category }) => (
    <View style={styles.itemContainer}>
      <View style={styles.itemDetails}>
         <Text style={styles.itemName}>{item.name}</Text>
         <Text style={styles.itemLimit}>
            {item.monthlyLimit !== null ? `Limit: ₹${item.monthlyLimit.toFixed(2)}` : 'No Limit'}
         </Text>
      </View>
      <View style={styles.itemActions}>
          {/* Disable edit button for default categories */}
          <TouchableOpacity 
            onPress={() => openEditModal(item)} 
            style={styles.actionButton} 
            disabled={item.name.toLowerCase() === 'uncategorized' || item.name.toLowerCase() === 'gain'}
           >
            <Ionicons 
              name="pencil-outline" 
              size={22} 
              color={(item.name.toLowerCase() === 'uncategorized' || item.name.toLowerCase() === 'gain') ? '#555' : '#0A84FF'} // Dim icon when disabled
            />
          </TouchableOpacity>
          {/* Disable delete button for default categories */}
          <TouchableOpacity 
            onPress={() => handleDelete(item)} 
            style={styles.actionButton} 
            disabled={item.name.toLowerCase() === 'uncategorized' || item.name.toLowerCase() === 'gain'}
          >
             <Ionicons 
               name="trash-outline" 
               size={22} 
               color={(item.name.toLowerCase() === 'uncategorized' || item.name.toLowerCase() === 'gain') ? '#555' : '#FF3B30'} // Dim icon when disabled
              />
          </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
            title: 'Manage Categories', 
            headerRight: () => (
                <TouchableOpacity onPress={openAddModal} style={{ marginRight: 15 }}>
                    <Ionicons name="add-circle-outline" size={28} color="#0A84FF" />
                </TouchableOpacity>
            )
        }} 
      />
      <FlatList
        data={categories}
        renderItem={renderCategoryItem}
        keyExtractor={(item) => item.id.toString()}
        ListEmptyComponent={<Text style={styles.emptyText}>No categories found.</Text>}
        refreshing={loading}
        onRefresh={fetchCategories}
      />
      {/* Add/Edit Modal Component */}
      <CategoryModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onSave={handleSaveCategory}
        initialData={editingCategory}
      />

      {/* Custom Alert */}
      <CustomAlert
         visible={alertVisible}
         title={alertTitle}
         message={alertMessage}
         buttons={alertButtons}
         onClose={() => setAlertVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  itemContainer: {
    backgroundColor: '#1C1C1E',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A3C',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDetails: {
      flex: 1,
      marginRight: 10,
  },
  itemName: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '500',
  },
  itemLimit: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 3,
  },
  itemActions: {
      flexDirection: 'row',
      alignItems: 'center',
  },
  actionButton: {
      padding: 8,
      marginLeft: 10,
  },
  emptyText: {
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
  },
}); 