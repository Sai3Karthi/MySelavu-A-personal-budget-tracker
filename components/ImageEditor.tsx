import React, { useState, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { 
  View, 
  Image, 
  StyleSheet, 
  Modal, 
  TouchableOpacity, 
  Text,
  PanResponder,
  Animated,
  Dimensions,
  SafeAreaView,
  ActivityIndicator
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Error boundary component to catch render errors
class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Image Editor Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Something went wrong.</Text>
          <Text style={styles.errorDetail}>{this.state.error?.toString()}</Text>
          <TouchableOpacity 
            style={styles.errorButton}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.errorButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

interface ImageEditorProps {
  imageUri: string;
  visible: boolean;
  onClose: () => void;
  onSave: (uri: string) => void;
}

const ImageEditor: React.FC<ImageEditorProps> = ({ imageUri, visible, onClose, onSave }) => {
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Animated values for smooth transitions
  const pan = useRef(new Animated.ValueXY()).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const rotateValue = useRef(new Animated.Value(0)).current;
  
  // Get original image dimensions
  React.useEffect(() => {
    if (imageUri) {
      Image.getSize(imageUri, (width, height) => {
        // Calculate aspect ratio to fit screen
        const screenRatio = SCREEN_WIDTH / SCREEN_HEIGHT;
        const imageRatio = width / height;
        
        let calculatedWidth, calculatedHeight;
        
        if (imageRatio > screenRatio) {
          // Image is wider than screen ratio
          calculatedWidth = SCREEN_WIDTH * 0.9;
          calculatedHeight = calculatedWidth / imageRatio;
        } else {
          // Image is taller than screen ratio
          calculatedHeight = SCREEN_HEIGHT * 0.7;
          calculatedWidth = calculatedHeight * imageRatio;
        }
        
        setImageSize({ width: calculatedWidth, height: calculatedHeight });
      });
    }
  }, [imageUri]);

  // Pan responder for dragging the image
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (event, gesture) => {
      // Update translation values
      const newTranslateX = translateX + gesture.dx;
      const newTranslateY = translateY + gesture.dy;
      
      // Apply constraints to keep image within view
      setTranslateX(newTranslateX);
      setTranslateY(newTranslateY);
      
      // Update animated values
      pan.setValue({ x: newTranslateX, y: newTranslateY });
    },
    onPanResponderRelease: (event, gesture) => {
      // Save the final position
      setTranslateX(translateX + gesture.dx);
      setTranslateY(translateY + gesture.dy);
    },
  });

  // Handle zooming with buttons
  const handleZoomIn = () => {
    const newScale = Math.min(scale + 0.1, 3);
    setScale(newScale);
    pinchScale.setValue(newScale);
  };

  const handleZoomOut = () => {
    const newScale = Math.max(scale - 0.1, 0.5);
    setScale(newScale);
    pinchScale.setValue(newScale);
  };

  // Set rotation to a specific angle (0, 90, 180, 270)
  const setRotationAngle = (angle: number) => {
    setRotation(angle);
    
    Animated.timing(rotateValue, {
      toValue: angle / 360,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  // Reset transformations
  const handleReset = () => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    setRotation(0);
    pan.setValue({ x: 0, y: 0 });
    pinchScale.setValue(1);
    rotateValue.setValue(0);
  };

  // Apply edits and save
  const handleSave = async () => {
    try {
      setIsProcessing(true);
      
      // Apply transformations using expo-image-manipulator
      const manipulateActions = [];
      
      // Only add rotation if it's not 0
      if (rotation !== 0) {
        // ImageManipulator expects rotation in degrees
        // For 90° intervals we need to use the correct rotation value
        if (rotation === 90) {
          manipulateActions.push({ rotate: 90 });
        } else if (rotation === 180) {
          manipulateActions.push({ rotate: 180 });
        } else if (rotation === 270) {
          manipulateActions.push({ rotate: 270 });
        }
      }
      
      // Only perform manipulation if there are actions to take
      if (manipulateActions.length > 0) {
        const manipResult = await ImageManipulator.manipulateAsync(
          imageUri,
          manipulateActions,
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        
        // Pass the manipulated image URI back
        onSave(manipResult.uri);
      } else {
        // No changes, return original
        onSave(imageUri);
      }
      
      setIsProcessing(false);
      onClose();
    } catch (error) {
      console.error('Image manipulation error:', error);
      setIsProcessing(false);
      // Still close the editor but use original image
      onSave(imageUri);
      onClose();
    }
  };

  // Convert rotation to interpolated values
  const spin = rotateValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Check if a rotation button should be highlighted
  const isRotationSelected = (angle: number) => rotation === angle;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <ErrorBoundary>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerButton}>
              <Text style={styles.headerButtonText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Edit Image</Text>
            <TouchableOpacity 
              onPress={handleSave} 
              style={[styles.headerButton, styles.sendButtonContainer]}
              disabled={isProcessing}
            >
              <Text style={[styles.headerButtonText, styles.saveButton]}>
                {isProcessing ? 'Processing...' : 'Send'}
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.imageContainer}>
            <Animated.View
              {...panResponder.panHandlers}
              style={{
                transform: [
                  { translateX: pan.x },
                  { translateY: pan.y },
                  { scale: pinchScale },
                  { rotate: spin }
                ]
              }}
            >
              <Image
                source={{ uri: imageUri }}
                style={[
                  styles.image,
                  { width: imageSize.width, height: imageSize.height }
                ]}
                resizeMode="contain"
              />
            </Animated.View>
            
            {/* Rotation degree indicator */}
            <View style={styles.rotationIndicator}>
              <Text style={styles.rotationDegrees}>{rotation}°</Text>
            </View>
            
            {/* Processing indicator */}
            {isProcessing && (
              <View style={styles.processingOverlay}>
                <ActivityIndicator size="large" color="#0A84FF" />
                <Text style={styles.processingText}>Processing image...</Text>
              </View>
            )}
          </View>
          
            {/* Rotation options */}
            <View style={styles.rotationOptionsContainer}>
              <Text style={styles.rotationOptionsTitle}>Rotation</Text>
              <View style={styles.rotationOptions}>
                <TouchableOpacity 
                  style={[
                    styles.rotationOption, 
                    isRotationSelected(0) && styles.rotationOptionSelected
                  ]} 
                  onPress={() => setRotationAngle(0)}
                >
                  <Text style={styles.rotationOptionText}>0°</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[
                    styles.rotationOption, 
                    isRotationSelected(90) && styles.rotationOptionSelected
                  ]} 
                  onPress={() => setRotationAngle(90)}
                >
                  <Text style={styles.rotationOptionText}>90°</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[
                    styles.rotationOption, 
                    isRotationSelected(180) && styles.rotationOptionSelected
                  ]} 
                  onPress={() => setRotationAngle(180)}
                >
                  <Text style={styles.rotationOptionText}>180°</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[
                    styles.rotationOption, 
                    isRotationSelected(270) && styles.rotationOptionSelected
                  ]} 
                  onPress={() => setRotationAngle(270)}
                >
                  <Text style={styles.rotationOptionText}>270°</Text>
                </TouchableOpacity>
              </View>
            </View>
          
          {/* Main controls */}
          <View style={styles.controls}>
            <TouchableOpacity style={styles.controlButton} onPress={handleZoomOut}>
              <Text style={styles.controlButtonText}>-</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlButton} onPress={handleZoomIn}>
              <Text style={styles.controlButtonText}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlButton} onPress={handleReset}>
              <Text style={styles.controlButtonText}>Reset</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ErrorBoundary>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#1F1F1F',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerButton: {
    padding: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  headerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  sendButtonContainer: {
    backgroundColor: '#0A84FF',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  saveButton: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111111',
    position: 'relative',
  },
  image: {
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rotationIndicator: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  rotationDegrees: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  rotationOptionsContainer: {
    backgroundColor: '#1F1F1F',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rotationOptionsTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 10,
  },
  rotationOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rotationOption: {
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 70,
    alignItems: 'center',
  },
  rotationOptionSelected: {
    backgroundColor: '#0A84FF',
  },
  rotationOptionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1F1F1F',
  },
  controlButton: {
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    minWidth: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    padding: 20,
  },
  errorText: {
    color: 'white',
    fontSize: 18,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  errorDetail: {
    color: '#FF3B30',
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
  },
  errorButton: {
    backgroundColor: '#0A84FF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  errorButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  processingText: {
    color: 'white',
    marginTop: 10,
    fontSize: 16,
  },
});

export default ImageEditor; 