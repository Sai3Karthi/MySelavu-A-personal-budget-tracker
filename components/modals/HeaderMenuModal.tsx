import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Platform, // Import Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors'; 
import { useColorScheme } from '@/hooks/useColorScheme';

interface HeaderMenuModalProps {
  visible: boolean;
  onClose: () => void;
  onNavigateManageCategories: () => void; // Specific handler for categories
  onNavigateMonthlyAnalyzer: () => void; // <-- Add handler for Analyzer
}

export default function HeaderMenuModal({
  visible,
  onClose,
  onNavigateManageCategories,
  onNavigateMonthlyAnalyzer, // <-- Receive handler
}: HeaderMenuModalProps) {
  const colorScheme = useColorScheme() || 'dark'; 
  const styles = getStyles(colorScheme);

  const handleNavigation = (handler: () => void) => {
    handler();
    onClose(); // Close modal after navigation
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          {/* Manage Categories Option */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => handleNavigation(onNavigateManageCategories)}
          >
            <Ionicons name="list-outline" size={22} color={Colors[colorScheme].tint} style={styles.icon} />
            <Text style={styles.menuText}>Manage Categories</Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          {/* Monthly Analyzer Option <-- ADDED */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => handleNavigation(onNavigateMonthlyAnalyzer)}
          >
            <Ionicons name="analytics-outline" size={22} color={Colors[colorScheme].tint} style={styles.icon} />
            <Text style={styles.menuText}>Monthly Analyzer</Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          {/* Close Option */}
          <TouchableOpacity style={styles.menuItem} onPress={onClose}> 
            <Ionicons name="close-circle-outline" size={22} color={Colors[colorScheme].text} style={styles.icon} />
            <Text style={styles.menuText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Function to generate styles based on color scheme
const getStyles = (scheme: 'light' | 'dark') => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors[scheme].card, 
    marginRight: 10, 
    marginTop: Platform.OS === 'ios' ? 60 : 50, // Adjust based on OS status bar
    borderRadius: 8,
    paddingVertical: 10, 
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
  icon: {
    marginRight: 15,
  },
  menuText: {
    color: Colors[scheme].text,
    fontSize: 16,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors[scheme].border,
    marginVertical: 5,
    marginHorizontal: 15,
  },
}); 