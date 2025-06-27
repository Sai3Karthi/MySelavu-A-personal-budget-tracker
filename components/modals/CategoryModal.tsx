import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Category } from '@/lib/database'; // Import Category type

interface CategoryModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (categoryData: { name: string; limit: number | null }) => Promise<boolean>; // Returns true on success
  initialData: Category | null; // null for Add, Category object for Edit
}

export default function CategoryModal({
  visible,
  onClose,
  onSave,
  initialData,
}: CategoryModalProps) {
  const [name, setName] = useState('');
  const [limitInput, setLimitInput] = useState(''); // Store limit as string for input flexibility
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = initialData !== null;
  const modalTitle = isEditing ? 'Edit Category' : 'Add New Category';

  // Reset state when modal visibility or initialData changes
  useEffect(() => {
    if (visible) {
      setName(initialData?.name || '');
      setLimitInput(initialData?.monthlyLimit?.toString() || '');
      setIsSaving(false);
    } else {
       // Clear fields when modal closes
       setName('');
       setLimitInput('');
    }
  }, [visible, initialData]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Validation Error', 'Category name cannot be empty.');
      return;
    }

    // Validate and parse limit
    let numericLimit: number | null = null;
    const trimmedLimit = limitInput.trim();
    if (trimmedLimit) {
      numericLimit = parseFloat(trimmedLimit);
      if (isNaN(numericLimit) || numericLimit < 0) {
        Alert.alert('Validation Error', 'Monthly limit must be a valid positive number or empty.');
        return;
      }
    }
    
    // Prevent editing default categories directly (should already be handled by button logic, but belt-and-suspenders)
    if (isEditing && (initialData.name.toLowerCase() === 'uncategorized' || initialData.name.toLowerCase() === 'gain') && initialData.name.toLowerCase() !== trimmedName.toLowerCase()) {
         Alert.alert("Cannot Rename", "The default 'Uncategorized' and 'Gain' categories cannot be renamed.");
         return;
    }

    setIsSaving(true);
    const success = await onSave({
        name: trimmedName,
        limit: numericLimit,
    });
    setIsSaving(false);

    if (success) {
      onClose(); // Close modal on successful save
    }
    // Error alerts should be handled by the onSave implementation in the parent screen
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        {/* Make overlay pressable to dismiss */}
        <Pressable style={styles.modalOverlayPressable} onPress={onClose}>
          {/* Prevent modal content press from closing */}
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{modalTitle}</Text>

            {/* Name Input */}
            <TextInput
              style={styles.modalInput}
              placeholder="Category Name (e.g., Groceries)"
              placeholderTextColor="#8E8E93"
              value={name}
              onChangeText={setName}
              autoFocus={!isEditing} // Autofocus on Add, not Edit
              editable={!(isEditing && (initialData.name.toLowerCase() === 'uncategorized' || initialData.name.toLowerCase() === 'gain'))}
            />

            {/* Limit Input */}
            <TextInput
              style={styles.modalInput}
              placeholder="Monthly Limit (Optional, e.g., 5000)"
              placeholderTextColor="#8E8E93"
              keyboardType="numeric"
              value={limitInput}
              onChangeText={setLimitInput}
            />

            {/* Action Buttons */}
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity onPress={onClose} style={[styles.modalButton, styles.cancelButton]} disabled={isSaving}>
                 <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={[styles.modalButton, styles.saveButton]} disabled={isSaving}>
                  <Text style={styles.buttonText}>{isSaving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlayPressable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  modalContent: {
    backgroundColor: '#1C1C1E',
    padding: 25,
    borderRadius: 15,
    width: '85%',
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#FFF',
  },
  modalInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#3A3A3C',
    marginBottom: 20,
    padding: 10,
    fontSize: 17,
    color: '#FFF',
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  modalButton: {
      flex: 1, // Make buttons share space
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
      marginHorizontal: 5, // Space between buttons
  },
  cancelButton: {
      backgroundColor: '#555',
  },
  saveButton: {
      backgroundColor: '#0A84FF', // Blue for save
  },
  buttonText: {
      color: '#FFF',
      fontSize: 16,
      fontWeight: '600',
  },
}); 