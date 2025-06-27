import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView, // Allow for potentially long messages
} from 'react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { ThemedText } from '@/components/ThemedText';

export type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type CustomAlertProps = {
  visible: boolean;
  title: string;
  message: string;
  buttons: AlertButton[];
  onClose: () => void; // Function to call when backdrop is pressed (optional close)
};

const CustomAlert: React.FC<CustomAlertProps> = ({ 
  visible, 
  title, 
  message, 
  buttons, 
  onClose 
}) => {
  const colorScheme = useColorScheme() ?? 'light';
  const styles = createStyles(colorScheme);

  if (!visible) {
    return null;
  }

  const handleButtonPress = (button: AlertButton) => {
    onClose(); // Close the modal first
    if (button.onPress) {
      // Use setTimeout to ensure modal dismissal animation finishes before action
      setTimeout(button.onPress, 50); 
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose} // Allow closing via back button etc.
    >
      <TouchableOpacity 
        style={styles.modalOverlay} 
        activeOpacity={1} 
        onPress={onClose} // Allow dismissing by tapping overlay
      >
        <TouchableOpacity activeOpacity={1} style={styles.alertBox} onPress={() => {}}> 
          {/* Prevent overlay press from closing when pressing inside alert box */}
          <ThemedText style={styles.alertTitle}>{title}</ThemedText>
          <ScrollView style={styles.messageScrollView}>
             <ThemedText style={styles.alertMessage}>{message}</ThemedText>
          </ScrollView>
          
          <View style={styles.buttonContainer}>
            {buttons.map((button, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.button,
                  buttons.length > 1 && styles.buttonWithSeparator, // Add separator if multiple buttons
                  button.style === 'cancel' && styles.buttonCancel,
                  button.style === 'destructive' && styles.buttonDestructive,
                ]}
                onPress={() => handleButtonPress(button)}
              >
                <ThemedText 
                  style={[
                    styles.buttonText,
                    button.style === 'cancel' && styles.buttonTextCancel,
                    button.style === 'destructive' && styles.buttonTextDestructive,
                  ]}
                >
                  {button.text}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const createStyles = (scheme: 'light' | 'dark') => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Dark overlay
    padding: 30, // Add padding around the alert box
  },
  alertBox: {
    width: '100%',
    maxWidth: 350, // Max width for the alert
    backgroundColor: Colors[scheme].card, // Use theme card color
    borderRadius: 14,
    paddingTop: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
    overflow: 'hidden', // Ensures border radius applies to children
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors[scheme].text, // Use theme text color
    marginBottom: 8,
    paddingHorizontal: 15, // Padding for title
    textAlign: 'center',
  },
  messageScrollView: {
    maxHeight: 200, // Limit message height
    width: '100%',
    marginBottom: 20,
  },
  alertMessage: {
    fontSize: 15,
    color: Colors[scheme].textSecondary, // Use theme text secondary
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 15, // Padding for message
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    borderTopWidth: 0.5,
    borderTopColor: Colors[scheme].border, // Use theme border color
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonWithSeparator: {
    borderLeftWidth: 0.5,
    borderLeftColor: Colors[scheme].border, // Use theme border color
  },
  buttonCancel: {
    // No specific style needed unless different background
  },
  buttonDestructive: {
    // No specific style needed unless different background
  },
  buttonText: {
    fontSize: 17,
    color: Colors[scheme].primary, // Use theme primary color
    fontWeight: '500', 
  },
  buttonTextCancel: {
    fontWeight: 'bold', // Cancel button often bold
  },
  buttonTextDestructive: {
    color: Colors[scheme].error, // Use theme error color
  },
});

export default CustomAlert; 