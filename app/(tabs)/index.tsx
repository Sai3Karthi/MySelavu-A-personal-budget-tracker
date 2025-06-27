import React from 'react';
import { StyleSheet, TextInput, TouchableOpacity, ScrollView, Platform, View, Keyboard, Dimensions, Animated, Image as RNImage, Alert, Easing, KeyboardAvoidingView, Pressable, Text, Modal, ActivityIndicator, StatusBar } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Camera } from 'expo-camera';
import ImageEditor from '@/components/ImageEditor';
import { MaterialIcons, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

type Message = {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  animation?: Animated.Value;
  image?: string; // URI for the image
  edited?: boolean; // Indicates if message was edited
};

type MessageGroup = {
  date: Date;
  messages: Message[];
};

// For Android keyboard handling
if (Platform.OS === 'android') {
  // Ensures the window doesn't resize and input remains in view
  if (Platform.Version >= 28) {
    // Removed event listener that was causing keyboard to close
  }
}

export default function HomeScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Roll-up menu animation and visibility state
  const [menuVisible, setMenuVisible] = useState(false);
  const menuAnimation = useRef(new Animated.Value(0)).current;
  
  // New state for image editor
  const [editorVisible, setEditorVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // Add states for image viewer
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  
  // Add states for message options
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [messageOptionsVisible, setMessageOptionsVisible] = useState(false);
  const [messageOptionsPosition, setMessageOptionsPosition] = useState({ x: 0, y: 0 });
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  // Selection mode states
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  
  // Track messages that are animating out
  const [deletingMessages, setDeletingMessages] = useState<string[]>([]);

  // Animation references for selection animations
  const selectionAnimations = useRef<{[key: string]: Animated.Value}>({});

  // Add permission check for camera
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [hasMediaLibraryPermission, setHasMediaLibraryPermission] = useState<boolean | null>(null);

  const [mediaPickerVisible, setMediaPickerVisible] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaLibrary.Asset[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

  // Check camera and media library permissions when component mounts
  useEffect(() => {
    (async () => {
      // Check camera permission
      const cameraStatus = await Camera.requestCameraPermissionsAsync();
      setHasCameraPermission(cameraStatus.status === 'granted');
      
      // Check media library permission
      const mediaLibraryStatus = await MediaLibrary.getPermissionsAsync();
      setHasMediaLibraryPermission(mediaLibraryStatus.status === 'granted');
    })();
  }, []);

  // Load media when picker becomes visible
  useEffect(() => {
    if (mediaPickerVisible) {
      loadMediaFromLibrary();
    }
  }, [mediaPickerVisible]);

  // Effect to scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // More reliable messages empty state check with forceful reset
  useEffect(() => {
    // Force re-render with timeout to ensure UI updates properly
    if (messages.length === 0) {
      // Force a re-render to update UI
      setDeletingMessages([]);
      
      // Use a short timeout to ensure UI refreshes
      setTimeout(() => {
        // Additional reset to ensure clean state
        setSelectionMode(false);
        setSelectedMessageIds([]);
        setMessageOptionsVisible(false);
        setSelectedMessageId(null);
        setEditingMessage(null);
        setInputText('');
        setMenuVisible(false);
      }, 10);
    }
  }, [messages.length]);

  // Function to load media from the device library
  const loadMediaFromLibrary = async () => {
    try {
      setLoadingMedia(true);
      
      // If we haven't checked permissions yet or don't have them, request them
      if (hasMediaLibraryPermission !== true) {
        const permission = await MediaLibrary.requestPermissionsAsync();
        setHasMediaLibraryPermission(permission.status === 'granted');
        
        if (permission.status !== 'granted') {
          Alert.alert(
            "Permission Required",
            "Please grant access to your media library to view your photos and videos.",
            [{ text: "OK" }]
          );
          setLoadingMedia(false);
          return;
        }
      }
      
      // Get the first 20 media items
      const media = await MediaLibrary.getAssetsAsync({
        first: 20,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: [MediaLibrary.SortBy.creationTime]
      });
      
      setMediaItems(media.assets);
      setLoadingMedia(false);
    } catch (error) {
      console.log('Error loading media:', error);
      setLoadingMedia(false);
      Alert.alert(
        "Error",
        "Failed to load media from your device. Please try again.",
        [{ text: "OK" }]
      );
    }
  };
  
  // Function to check if an asset is a video
  const isVideo = (asset: MediaLibrary.Asset) => {
    return asset.mediaType === 'video';
  };
  
  // Format duration for videos (converts milliseconds to mm:ss format)
  const formatDuration = (durationMs: number) => {
    if (!durationMs) return '';
    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
  };

  const groupMessagesByDate = (messages: Message[]): MessageGroup[] => {
    const groups: MessageGroup[] = [];
    let currentGroup: MessageGroup | null = null;

    // Sort messages by date (oldest first)
    const sortedMessages = [...messages].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    sortedMessages.forEach((message) => {
      const messageDate = new Date(message.timestamp);
      messageDate.setHours(0, 0, 0, 0);

      if (!currentGroup || currentGroup.date.getTime() !== messageDate.getTime()) {
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          date: messageDate,
          messages: [message],
        };
      } else {
        currentGroup.messages.push(message);
      }
    });

    if (currentGroup) {
      groups.push(currentGroup);
    }

    // Filter out any groups with empty messages arrays
    return groups.filter(group => group.messages.length > 0);
  };

  const formatDate = (date: Date): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.getTime() === today.getTime()) {
      return 'Today';
    } else if (date.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
      });
    }
  };

  const createAnimatedMessage = (text: string, isUser: boolean, image?: string): Message => {
    return {
      id: Date.now().toString(),
      text: text.trim(),
      isUser,
      timestamp: new Date(),
      animation: new Animated.Value(0),
      image
    };
  };

  const sendMessage = () => {
    if (inputText.trim()) {
      // Close menu if open
      if (menuVisible) {
        toggleMenu();
      }
      
      // If editing a message, update it
      if (editingMessage) {
        updateMessage();
        return;
      }
      
      // Otherwise send a new message
      const newMessage = createAnimatedMessage(inputText.trim(), true);
      
      setMessages(prev => [...prev, newMessage]);
      setInputText('');
      
      // Animate the new message
      Animated.timing(newMessage.animation!, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      
      // Keep focus on input field to prevent keyboard from closing
      setTimeout(() => {
        if (TextInput.State.currentlyFocusedInput()) {
          TextInput.State.currentlyFocusedInput().focus();
        }
      }, 50);
    }
  };

  const pickImage = async () => {
    // Close menu immediately
    setMenuVisible(false);
    
    // Request permissions
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      return;
    }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false, // Always false since we'll use our own editor
      quality: 0.8,
    });
    
    if (!result.canceled) {
      const selectedAsset = result.assets[0];
      setSelectedImage(selectedAsset.uri);
      setEditorVisible(true);
    }
  };

  const takePhoto = async () => {
    // Close menu
    toggleMenu();
    
    if (hasCameraPermission !== true) {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          "Camera Permission Required",
          "Please enable camera access in your device settings to take photos.",
          [{ text: "OK" }]
        );
        return;
      }
    }
    
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false, // We'll use our own editor
      quality: 0.8,
    });
    
    if (!result.canceled) {
      const capturedImage = result.assets[0];
      setSelectedImage(capturedImage.uri);
      setEditorVisible(true);
    }
  };

  const handleEditorClose = () => {
    setEditorVisible(false);
    setSelectedImage(null);
  };

  const handleImageSave = (editedImageUri: string) => {
    // Create and send image message with the edited image
    const newMessage = createAnimatedMessage('', true, editedImageUri);
    
    setMessages(prev => [...prev, newMessage]);
    
    // Animate the new message
    Animated.timing(newMessage.animation!, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    // Clear editor state
    setEditorVisible(false);
    setSelectedImage(null);
    
    // Close media picker if it's open
    setMediaPickerVisible(false);
  };

  const toggleMenu = () => {
    if (menuVisible) {
      // Hide menu immediately
      setMenuVisible(false);
      
      // Animate out for visual effect
      Animated.timing(menuAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      }).start();
    } else {
      // Show menu
      setMenuVisible(true);
      Animated.timing(menuAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      }).start();
    }
  };

  const handleDocumentsPress = () => {
    // Future implementation for document picking
    setMenuVisible(false);
    Alert.alert("Documents", "Document picker will be implemented soon");
  };

  const openMediaPicker = () => {
    setMenuVisible(false);
    setMediaPickerVisible(true);
  };

  const messageGroups = groupMessagesByDate(messages);

  // Prevent unnecessary rerenders by adding proper memoization
  const AnimatedMessageBubble = React.useCallback(({ message, isUser }: { message: Message, isUser: boolean }) => {
    const translateY = message.animation?.interpolate({
      inputRange: [0, 1],
      outputRange: [50, 0],
    }) || 0;
    
    const opacity = message.animation?.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }) || 1;

    // Add scale animation for deletion
    const scale = message.animation?.interpolate({
      inputRange: [0, 1],
      outputRange: [0.8, 1],
    }) || 1;

    // Format time with PM/AM
    const formattedTime = useMemo(() => {
      return message.timestamp.toLocaleTimeString([], { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    }, [message.timestamp]);

    const [imageHeight, setImageHeight] = useState<number>(300);
    const [imageWidth, setImageWidth] = useState<number>(200);
    const [dimensionsCalculated, setDimensionsCalculated] = useState(false);
    
    // Calculate image dimensions only once when the message is first mounted
    useEffect(() => {
      let isMounted = true;
      
      if (message.image && !dimensionsCalculated) {
        // Use default dimensions immediately to prevent layout shifts
        setDimensionsCalculated(true);
        
        RNImage.getSize(message.image, (width, height) => {
          if (!isMounted) return;
          
          // Calculate aspect ratio and set dimensions
          const aspectRatio = width / height;
          
          if (aspectRatio > 1) {
            // Landscape image
            const newWidth = Math.min(280, width);
            setImageWidth(newWidth);
            setImageHeight(newWidth / aspectRatio);
          } else {
            // Portrait image
            const newHeight = Math.min(400, height);
            setImageHeight(newHeight);
            setImageWidth(newHeight * aspectRatio);
          }
        }, error => {
          if (!isMounted) return;
          console.log('Error getting image size:', error);
        });
      }
      
      return () => {
        isMounted = false;
      };
    }, [message.id, message.image]); // Only run once per message

    // Initialize selection animation if not exists
    // This is now a side effect that runs only when message.id changes
    useEffect(() => {
      if (!selectionAnimations.current[message.id]) {
        selectionAnimations.current[message.id] = new Animated.Value(0);
      }
      
      // Cleanup animation when message is unmounted
      return () => {
        if (selectionAnimations.current[message.id]) {
          delete selectionAnimations.current[message.id];
        }
      };
    }, [message.id]);

    // Get the selection animation value (memoized)
    const selectionAnim = useMemo(() => 
      selectionAnimations.current[message.id] || new Animated.Value(0),
    [message.id]);

    // Is this message selected (memoized)
    const isSelected = useMemo(() => 
      selectedMessageIds.includes(message.id),
    [selectedMessageIds, message.id]);
    
    // Effect to animate selection/deselection
    useEffect(() => {
      if (selectionAnim) {
        Animated.timing(selectionAnim, {
          toValue: isSelected ? 1 : 0,
          duration: 200,
          useNativeDriver: false, // Can't use native driver for backgroundColor interpolation
        }).start();
      }
    }, [isSelected, selectionAnim]);

    // Calculate interpolated selection styles (memoized)
    const selectionStyles = useMemo(() => {
      const selectionBackground = selectionAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(10, 132, 255, 0)', 'rgba(10, 132, 255, 0.3)']
      });
      
      const selectionBorder = selectionAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 2]
      });
      
      const checkmarkScale = selectionAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1]
      });

      return { selectionBackground, selectionBorder, checkmarkScale };
    }, [selectionAnim]);

    // Single long press handler for both image and text messages
    const handleLongPress = useCallback(() => {
      console.log("Long press detected on message:", message.id);
      if (!selectionMode) {
        console.log("Entering selection mode");
        setSelectionMode(true);
        setSelectedMessageIds([message.id]);
      }
    }, [message.id, selectionMode]);
    
    // Single tap handler that works for both selection and normal mode
    const handlePress = useCallback((event: any) => {
      if (selectionMode) {
        console.log("Selection mode tap on message:", message.id);
        // In selection mode, toggle selection
        if (isSelected) {
          console.log("Unselecting message");
          const newSelection = selectedMessageIds.filter(id => id !== message.id);
          setSelectedMessageIds(newSelection);
          // If nothing left selected, exit selection mode
          if (newSelection.length === 0) {
            setSelectionMode(false);
          }
        } else {
          console.log("Selecting message");
          setSelectedMessageIds([...selectedMessageIds, message.id]);
        }
      } else if (message.image) {
        // Not in selection mode, open image viewer for images
        openImageViewer(message.image);
      } else if (isUser) {
        // Not in selection mode, show options menu for text messages
        const { pageX, pageY } = event.nativeEvent;
        showMessageOptions(message.id, { x: pageX, y: pageY });
      }
    }, [message.id, message.image, isUser, isSelected, selectionMode, selectedMessageIds]);

    const animatedStyle = useMemo(() => {
      // Check if this message is being deleted
      const isDeleting = deletingMessages.includes(message.id);
      
      return [
        styles.messageBubble,
        isUser ? styles.userMessage : styles.botMessage,
        message.image ? styles.imageBubble : {},
        { 
          transform: [
            { translateY }, 
            { scale: isDeleting ? scale : 1 }
          ], 
          opacity: isDeleting ? 0 : opacity,
          height: isDeleting ? 0 : undefined,
          marginVertical: isDeleting ? 0 : 2,
        }
      ];
    }, [isUser, message.image, translateY, opacity, scale, deletingMessages, message.id]);

    // Generate message bubble contents - memoized to prevent rerenders
    const renderMessage = useMemo(() => {
      const { selectionBackground, selectionBorder, checkmarkScale } = selectionStyles;
      
      if (message.image) {
        return (
          <Animated.View style={[
            styles.imageContainer,
            { 
              width: imageWidth, 
              height: imageHeight,
              minWidth: 200,
              minHeight: 200,
              borderWidth: selectionBorder,
              borderColor: '#0A84FF',
              backgroundColor: 'rgba(0, 0, 0, 0.8)'
            }
          ]}>
            <Image
              source={{ uri: message.image }}
              style={styles.messageImage}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={300}
              placeholder={{ uri: message.image, blurRadius: 30 }}
              recyclingKey={message.id}
            />
            {isSelected && (
              <Animated.View style={[
                styles.checkmarkContainer,
                { transform: [{ scale: checkmarkScale }] }
              ]}>
                <MaterialIcons name="check" size={20} color="#FFFFFF" />
              </Animated.View>
            )}
            <View style={styles.imageOverlay}>
              <View style={styles.imageTimestampContainer}>
                <ThemedText style={styles.timestamp}>{formattedTime}</ThemedText>
                {isUser && <ThemedText style={styles.checkmark}>✓</ThemedText>}
              </View>
            </View>
          </Animated.View>
        );
      } else {
        return (
          <Animated.View style={[
            { padding: 6 },
            {
              backgroundColor: selectionBackground,
              borderWidth: selectionBorder,
              borderColor: '#0A84FF',
              borderRadius: 16
            }
          ]}>
            <ThemedText style={[
              styles.messageText,
              message.edited ? styles.editedMessageText : null
            ]}>
              {message.text}
            </ThemedText>
            <View style={styles.messageTimestampContainer}>
              <ThemedText style={styles.timestamp}>{formattedTime}</ThemedText>
              {message.edited && <ThemedText style={styles.editedText}>edited</ThemedText>}
              {isUser && <ThemedText style={styles.checkmark}>✓</ThemedText>}
            </View>
            {isSelected && (
              <Animated.View style={[
                styles.checkmarkContainer,
                { transform: [{ scale: checkmarkScale }] }
              ]}>
                <MaterialIcons name="check" size={20} color="#FFFFFF" />
              </Animated.View>
            )}
          </Animated.View>
        );
      }
    }, [
      message.id,
      message.image, 
      message.text, 
      message.edited, 
      isUser, 
      isSelected, 
      formattedTime, 
      imageWidth, 
      imageHeight, 
      selectionStyles
    ]);

    return (
      <Animated.View style={animatedStyle}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={500}
        >
          {renderMessage}
        </TouchableOpacity>
      </Animated.View>
    );
  }, [selectionMode, selectedMessageIds, deletingMessages]);

  // Simplify selection mode functions
  const exitSelectionMode = useCallback(() => {
    console.log("Exiting selection mode");
    setSelectionMode(false);
    setSelectedMessageIds([]);
  }, []);

  // Function to animate out a message or messages
  const animateMessageDeletion = (messageIds: string[]) => {
    // Mark messages as deleting
    setDeletingMessages(prev => [...prev, ...messageIds]);
    
    // Animate each message opacity to 0 and scale down
    messageIds.forEach(id => {
      const message = messages.find(m => m.id === id);
      if (message && message.animation) {
        // Create a new animation value for scale
        const scaleAnim = new Animated.Value(1);
        
        Animated.parallel([
          Animated.timing(message.animation, {
            toValue: 0,
            duration: 300,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 0.8,
            duration: 300,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          })
        ]).start(({ finished }) => {
          if (finished) {
            // After animation completes, actually remove the message from state
            setMessages(prev => {
              const updatedMessages = prev.filter(m => m.id !== id);
              console.log("Messages after delete:", updatedMessages.length);
              return updatedMessages;
            });
            setDeletingMessages(prev => prev.filter(mid => mid !== id));
          }
        });
      } else {
        // If no animation value exists, remove immediately
        setMessages(prev => {
          const updatedMessages = prev.filter(m => m.id !== id);
          console.log("Messages after immediate delete:", updatedMessages.length);
          return updatedMessages;
        });
      }
    });
  };

  // Modify deleteSelectedMessages to have a slight delay for visual effect
  const deleteSelectedMessages = useCallback(() => {
    console.log("Deleting selected messages:", selectedMessageIds);
    if (selectedMessageIds.length > 0) {
      const messagesToDelete = [...selectedMessageIds];
      
      // Exit selection mode first
      exitSelectionMode();
      
      // Small delay before deletion animation for better visual effect
      setTimeout(() => {
        animateMessageDeletion(messagesToDelete);
      }, 50);
    }
  }, [selectedMessageIds, exitSelectionMode]);
  
  // Function to delete a message
  const deleteMessage = (messageId: string) => {
    animateMessageDeletion([messageId]);
    closeMessageOptions();
  };
  
  // Function to view image in full screen
  const openImageViewer = (imageUri: string) => {
    setFullScreenImage(imageUri);
    setImageViewerVisible(true);
    setImageLoading(true); // Reset loading state when opening a new image
  };
  
  // Function to close image viewer
  const closeImageViewer = () => {
    setImageViewerVisible(false);
    setFullScreenImage(null);
    setImageLoading(false);
  };
  
  // Function to show message options
  const showMessageOptions = (messageId: string, position: { x: number, y: number }) => {
    setSelectedMessageId(messageId);
    setMessageOptionsPosition(position);
    setMessageOptionsVisible(true);
  };
  
  // Function to close message options
  const closeMessageOptions = () => {
    setMessageOptionsVisible(false);
    setSelectedMessageId(null);
  };
  
  // Function to start editing a message
  const startEditingMessage = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message && message.isUser) {
      setEditingMessage(message);
      setInputText(message.text);
      closeMessageOptions();
    }
  };
  
  // Function to cancel editing
  const cancelEditing = () => {
    setEditingMessage(null);
    setInputText('');
  };
  
  // Function to update edited message
  const updateMessage = () => {
    if (editingMessage && inputText.trim()) {
      setMessages(prevMessages => 
        prevMessages.map(message => 
          message.id === editingMessage.id 
            ? { ...message, text: inputText.trim(), edited: true } 
            : message
        )
      );
      setInputText('');
      setEditingMessage(null);
    }
  };

  return (
    <View style={styles.container}>
      <ThemedView style={styles.headerContainer}>
        {selectionMode ? (
          // Selection mode header
          <>
            <TouchableOpacity
              style={styles.cancelSelectionButton}
              onPress={exitSelectionMode}
            >
              <MaterialIcons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <ThemedText style={styles.selectionCount}>
              {selectedMessageIds.length} selected
            </ThemedText>
            <TouchableOpacity
              style={styles.deleteSelectedButton}
              onPress={deleteSelectedMessages}
            >
              <MaterialIcons name="delete" size={24} color="#FF453A" />
            </TouchableOpacity>
          </>
        ) : (
          // Normal header
          <>
            <ThemedView style={styles.profileImage} />
            <ThemedText type="title" style={styles.header}>My Journal</ThemedText>
          </>
        )}
      </ThemedView>

      <View style={styles.mainContent}>
        <ScrollView 
          ref={scrollViewRef}
          style={styles.chatContainer}
          contentContainerStyle={[
            styles.chatContent, 
            { flexGrow: 1, justifyContent: 'flex-end' }
          ]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          onContentSizeChange={() => {
            scrollViewRef.current?.scrollToEnd({ animated: false });
          }}
        >
          {messages.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <MaterialIcons name="chat" size={64} color="rgba(255, 255, 255, 0.2)" />
              <ThemedText style={styles.emptyStateText}>
                Start sharing your stories
              </ThemedText>
            </View>
          ) : (
            messageGroups.map((group) => (
              <View key={group.date.toISOString()} style={styles.dateGroup}>
                <ThemedText style={styles.dateHeader}>
                  {formatDate(group.date)}
                </ThemedText>
                <View style={styles.messagesContainer}>
                  {group.messages.map((message) => (
                    <AnimatedMessageBubble 
                      key={message.id}
                      message={message}
                      isUser={message.isUser}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
        
        {/* Only show input container when not in selection mode */}
        {!selectionMode && (
          <View style={styles.inputContainer}>
            <TouchableOpacity 
              style={styles.attachButton}
              onPress={toggleMenu}
            >
              <MaterialIcons name="add" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Message"
              placeholderTextColor="#8E8E93"
              multiline
              blurOnSubmit={false}
              returnKeyType="default"
              keyboardAppearance="dark"
            />
            {editingMessage ? (
              <TouchableOpacity 
                style={styles.cancelEditButton}
                onPress={cancelEditing}
              >
                <MaterialIcons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity 
              style={styles.sendButton}
              onPress={sendMessage}
            >
              <MaterialIcons name="send" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Only show modals when not in selection mode */}
      {!selectionMode && (
        <>
          {/* Media Picker Modal */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={mediaPickerVisible && !selectionMode}
            onRequestClose={() => setMediaPickerVisible(false)}
          >
            <View style={styles.mediaPickerContainer}>
              <View style={styles.mediaPicker}>
                <View style={styles.mediaPickerHeader}>
                  <TouchableOpacity 
                    onPress={() => setMediaPickerVisible(false)}
                    style={styles.mediaPickerCloseButton}
                  >
                    <Text style={styles.mediaPickerHeaderText}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.mediaPickerTitle}>Gallery</Text>
                  <TouchableOpacity style={styles.mediaPickerSendButton}>
                    <Text style={styles.mediaPickerHeaderText}>Send</Text>
                  </TouchableOpacity>
                </View>
                
                <View style={styles.mediaGrid}>
                  {/* First row - Camera */}
                  <TouchableOpacity 
                    style={styles.cameraButton}
                    onPress={() => {
                      setMediaPickerVisible(false);
                      takePhoto();
                    }}
                  >
                    <View style={styles.cameraIconContainer}>
                      <MaterialIcons name="camera-alt" size={36} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                  
                  {/* Loading indicator or under development message */}
                  {loadingMedia ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color="#FFFFFF" />
                      <Text style={styles.loadingText}>Loading media...</Text>
                    </View>
                  ) : (
                    <View style={styles.noMediaContainer}>
                      <Text style={styles.noMediaText}>Under development</Text>
                      <Text style={styles.noMediaSubtext}>Media library access limited in Expo Go</Text>
                    </View>
                  )}
                </View>
                
                <View style={styles.mediaPickerFooter}>
                  <TouchableOpacity 
                    style={styles.footerButton}
                    onPress={loadMediaFromLibrary}
                  >
                    <View style={styles.footerIconContainer}>
                      <MaterialIcons name="autorenew" size={24} color="#FFFFFF" />
                    </View>
                    <Text style={styles.footerButtonText}>Refresh</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.footerButton}
                    onPress={() => {
                      setMediaPickerVisible(false);
                      pickImage();
                    }}
                  >
                    <View style={styles.footerIconContainer}>
                      <MaterialIcons name="collections" size={24} color="#FFFFFF" />
                    </View>
                    <Text style={styles.footerButtonText}>Browse</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Menu items */}
          {menuVisible && !selectionMode && (
            <>
              <Pressable 
                style={styles.menuBackdrop} 
                onPress={toggleMenu}
              />
              <Animated.View 
                style={[
                  styles.menuContainer,
                  {
                    opacity: menuAnimation,
                    transform: [
                      { 
                        translateY: menuAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [50, 0]
                        })
                      }
                    ]
                  }
                ]}
              >
                <View style={styles.menuGrid}>
                  <Pressable 
                    style={styles.menuGridItem} 
                    onPress={openMediaPicker}
                  >
                    <View style={styles.menuIcon}>
                      <MaterialIcons name="photo-camera" size={24} color="#FFFFFF" />
                    </View>
                    <Text style={styles.menuText}>Photo or video</Text>
                  </Pressable>
                  
                  <Pressable 
                    style={styles.menuGridItem} 
                    onPress={pickImage}
                  >
                    <View style={styles.menuIcon}>
                      <MaterialIcons name="insert-drive-file" size={24} color="#FFFFFF" />
                    </View>
                    <Text style={styles.menuText}>Document</Text>
                  </Pressable>
                </View>
              </Animated.View>
            </>
          )}

          {/* Image Editor Modal */}
          {selectedImage && !selectionMode && (
            <ImageEditor
              imageUri={selectedImage}
              visible={editorVisible}
              onClose={handleEditorClose}
              onSave={handleImageSave}
            />
          )}

          {/* Full Screen Image Viewer */}
          <Modal
            animationType="fade"
            transparent={true}
            visible={imageViewerVisible && !selectionMode}
            onRequestClose={closeImageViewer}
          >
            <StatusBar backgroundColor="#000000" barStyle="light-content" />
            <View style={styles.imageViewerContainer}>
              <TouchableOpacity 
                style={styles.imageViewerCloseButton}
                onPress={closeImageViewer}
              >
                <MaterialIcons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
              
              {fullScreenImage && (
                <View style={styles.imageViewerContent}>
                  {imageLoading && (
                    <ActivityIndicator 
                      size="large" 
                      color="#FFFFFF" 
                      style={styles.imageLoadingIndicator} 
                    />
                  )}
                  <Image 
                    source={{ uri: fullScreenImage }}
                    style={styles.fullScreenImage}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    transition={300}
                    placeholder={{ uri: fullScreenImage, blurRadius: 50 }}
                    onLoadStart={() => setImageLoading(true)}
                    onLoad={() => setImageLoading(false)}
                  />
                  <TouchableOpacity 
                    style={styles.imageShareButton}
                    onPress={() => {
                      // Future implementation for sharing
                      Alert.alert("Share", "Image sharing will be implemented soon");
                    }}
                  >
                    <MaterialIcons name="share" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Modal>

          {/* Message Options Popup */}
          {messageOptionsVisible && !selectionMode && (
            <Pressable 
              style={styles.optionsBackdrop}
              onPress={closeMessageOptions}
            >
              <View 
                style={[
                  styles.messageOptionsContainer,
                  {
                    position: 'absolute',
                    top: messageOptionsPosition.y - 80,
                    left: messageOptionsPosition.x - 90,
                  }
                ]}
              >
                <Pressable 
                  style={styles.messageOption}
                  onPress={() => selectedMessageId && startEditingMessage(selectedMessageId)}
                >
                  <MaterialIcons name="edit" size={20} color="#FFFFFF" />
                  <Text style={styles.messageOptionText}>Edit</Text>
                </Pressable>
                
                <View style={styles.messageOptionDivider} />
                
                <Pressable 
                  style={styles.messageOption}
                  onPress={() => selectedMessageId && deleteMessage(selectedMessageId)}
                >
                  <MaterialIcons name="delete" size={20} color="#FF453A" />
                  <Text style={[styles.messageOptionText, { color: '#FF453A' }]}>Delete</Text>
                </Pressable>
              </View>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  mainContent: {
    flex: 1,
    position: 'relative',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 48,
    padding: 16,
    backgroundColor: '#1F1F1F',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0A84FF',
  },
  header: {
    fontSize: 24,
    marginLeft: 12,
    color: '#FFFFFF',
  },
  chatContainer: {
    flex: 1,
    position: 'relative',
  },
  chatContent: {
    padding: 16,
    paddingBottom: 84,
    flexGrow: 1,
    minHeight: '100%',
    display: 'flex',
  },
  dateGroup: {
    backgroundColor: 'transparent',
    opacity: 1,
    marginBottom: 8,
    marginTop: 4,
    flexDirection: 'column',
    flexShrink: 1,
    alignItems: 'stretch',
    overflow: 'hidden',
    minHeight: 0,
  },
  messagesContainer: {
    flexDirection: 'column',
    alignItems: 'stretch',
    width: '100%',
  },
  dateHeader: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 4,
    backgroundColor: '#1F1F1F',
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 10,
    overflow: 'hidden',
    maxWidth: '80%',
    flexWrap: 'wrap',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 8,
    paddingVertical: 6,
    paddingRight: 8,
    paddingLeft: 12,
    borderRadius: 16,
    marginVertical: 2,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#0E4DB1',
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 4,
    marginLeft: 40,
    paddingRight: 10,
  },
  botMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#2C2C2E',
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 16, 
    borderTopRightRadius: 16,
    borderTopLeftRadius: 4,
    marginRight: 40,
  },
  messageContentWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  messageText: {
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 22,
    flexShrink: 1,
    marginRight: 85,
    paddingBottom: 14,
  },
  editedMessageText: {
    marginRight: 130, // More space for edited messages to accommodate the "edited" text
  },
  messageTimestampContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    right: 2,
    bottom: 2,
  },
  timestamp: {
    fontSize: 12,
    opacity: 0.7,
    color: '#FFFFFF',
  },
  checkmark: {
    fontSize: 12,
    color: '#FFFFFF',
    marginLeft: 2,
    opacity: 0.7,
  },
  editedText: {
    fontSize: 12,
    color: '#8E8E93',
    marginLeft: 4,
    marginRight: 2,
    opacity: 0.7,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1F1F1F',
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  input: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 16,
    marginRight: 8,
    color: '#FFFFFF',
    minHeight: 40,
  },
  sendButton: {
    backgroundColor: '#0A84FF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 40,
  },
  imageBubble: {
    padding: 0,
    paddingVertical: 0,
    paddingRight: 0,
    paddingLeft: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    maxWidth: '85%',
  },
  imageContainer: {
    position: 'relative',
    maxWidth: 280,
    minWidth: 200,
    maxHeight: 400,
    minHeight: 150,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111111',
  },
  messageImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
    backgroundColor: '#111111',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  imageTimestampContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  menuContainer: {
    position: 'absolute',
    bottom: 70,
    left: 12,
    right: 12,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    borderRadius: 8,
    padding: 12,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.39,
    shadowRadius: 8.30,
    elevation: 13,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  menuGridItem: {
    width: '48%',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: 'transparent',
  },
  menuIcon: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: 'transparent',
  },
  menuText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '400',
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 50,
  },
  mediaPickerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaPicker: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    width: '90%',
    height: '50%',
    maxHeight: 500,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.39,
    shadowRadius: 8.30,
    elevation: 13,
  },
  mediaPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  mediaPickerCloseButton: {
    paddingHorizontal: 10,
  },
  mediaPickerHeaderText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  mediaPickerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  mediaPickerSendButton: {
    paddingHorizontal: 10,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 2,
    flex: 1,
  },
  cameraButton: {
    width: '33.3%',
    aspectRatio: 1,
    padding: 2,
  },
  cameraIconContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 0,
  },
  galleryItem: {
    width: '33.3%',
    aspectRatio: 1,
    padding: 2,
    position: 'relative',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  durationText: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    color: '#FFFFFF',
    fontSize: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mediaPickerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 10,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  footerButton: {
    alignItems: 'center', 
    paddingVertical: 8,
  },
  footerIconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  footerButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 10,
  },
  noMediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noMediaText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 10,
  },
  noMediaSubtext: {
    color: '#8E8E93',
    fontSize: 12,
  },
  permissionButton: {
    backgroundColor: '#0A84FF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 40,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  imageViewerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerCloseButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 1000,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  imageViewerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  imageLoadingIndicator: {
    position: 'absolute',
    zIndex: 5,
  },
  imageShareButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    zIndex: 1000,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  },
  optionsBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 50,
  },
  messageOptionsContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 12,
  },
  messageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  messageOptionText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginLeft: 8,
  },
  messageOptionDivider: {
    height: 1,
    backgroundColor: '#2C2C2E',
    marginVertical: 8,
  },
  editingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
    marginBottom: 8,
    width: '100%',
  },
  editingText: {
    color: '#FFFFFF',
    fontSize: 14,
    flex: 1,
  },
  cancelEditButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  selectedItem: {
    backgroundColor: 'rgba(10, 132, 255, 0.3)',
    borderWidth: 2,
    borderColor: '#0A84FF',
    borderRadius: 16,
  },
  checkmarkContainer: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#0A84FF',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  cancelSelectionButton: {
    padding: 8,
  },
  deleteSelectedButton: {
    padding: 8,
  },
  selectionCount: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    textAlign: 'center',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyStateText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 18,
    marginTop: 16,
  },
});
