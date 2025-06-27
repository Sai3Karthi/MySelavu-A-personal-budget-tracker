import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

// Key used to store the selected purpose in AsyncStorage
const PURPOSE_STORAGE_KEY = '@app_usage_purpose';

export default function PurposeSelectorScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() || 'dark';
  const styles = getStyles(colorScheme);
  const [loading, setLoading] = useState(false);

  // Function to handle when a purpose button is pressed
  const handleSelectPurpose = async (purpose: 'student' | 'professional' | 'personal') => {
    setLoading(true); // Show loading indicator
    try {
      // Save the selected purpose to AsyncStorage
      await AsyncStorage.setItem(PURPOSE_STORAGE_KEY, purpose);
      console.log(`[PurposeSelector] Purpose saved: ${purpose}`);
      
      // Navigate to the main app screen
      router.replace('/(tabs)'); 

    } catch (e) {
      console.error('[PurposeSelector] Failed to save purpose:', e);
      Alert.alert('Error', 'Could not save your selection. Please try again.');
      setLoading(false); // Hide loading indicator on error
    }
    // No finally setLoading(false) because we navigate away on success
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>How will you be using this app?</ThemedText>
      <ThemedText style={styles.subtitle}>
        Select your primary purpose. This helps in tailoring future features.
      </ThemedText>

      {loading ? (
        // Show loading indicator while saving
        <ActivityIndicator size="large" color={Colors[colorScheme].tint} style={styles.loader} />
      ) : (
        // Show purpose options when not loading
        <View style={styles.optionsContainer}>
          <TouchableOpacity 
            style={styles.optionButton} 
            onPress={() => handleSelectPurpose('student')}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.optionText}>🎓 Student</ThemedText>
            <ThemedText style={styles.optionDescription}>Managing budgets, tracking allowances.</ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.optionButton} 
            onPress={() => handleSelectPurpose('professional')}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.optionText}>💼 Professional</ThemedText>
             <ThemedText style={styles.optionDescription}>Tracking business expenses, project costs.</ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.optionButton} 
            onPress={() => handleSelectPurpose('personal')}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.optionText}>🏠 Personal</ThemedText>
             <ThemedText style={styles.optionDescription}>Household budgeting, personal finance.</ThemedText>
          </TouchableOpacity>
        </View>
      )}
    </ThemedView>
  );
}

// Function to generate styles based on the color scheme
const getStyles = (scheme: 'light' | 'dark') => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: Colors[scheme].background,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
    color: Colors[scheme].text,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: Colors[scheme].textSecondary,
    marginBottom: 50,
    lineHeight: 22,
  },
  loader: {
    marginTop: 30,
  },
  optionsContainer: {
    width: '100%',
    maxWidth: 350,
  },
  optionButton: {
    backgroundColor: Colors[scheme].card,
    paddingVertical: 20,
    paddingHorizontal: 25,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors[scheme].border,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: scheme === 'dark' ? 0.1 : 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  optionText: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors[scheme].tint,
    marginBottom: 5,
  },
  optionDescription: {
    fontSize: 14,
    color: Colors[scheme].textSecondary,
    textAlign: 'center',
  },
}); 