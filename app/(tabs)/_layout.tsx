import { Tabs, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, TouchableOpacity, View } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { Ionicons } from '@expo/vector-icons';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import HeaderMenuModal from '@/components/modals/HeaderMenuModal';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  const [isMenuModalVisible, setMenuModalVisible] = useState(false);

  const openMenuModal = () => {
    setMenuModalVisible(true);
  };

  const closeMenuModal = () => {
    setMenuModalVisible(false);
  };

  const navigateToManageCategories = () => {
    router.push('/manage-categories');
  };

  const navigateToMonthlyAnalyzer = () => {
    router.push('/monthly-analyzer');
  };

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarBackground: TabBarBackground,
          tabBarStyle: Platform.select({
            ios: {
              position: 'absolute',
            },
            default: {},
          }),
          headerStyle: {
              backgroundColor: Colors[colorScheme ?? 'light'].background,
          },
          headerTintColor: Colors[colorScheme ?? 'light'].tint,
          headerTitleStyle: {
              fontWeight: 'bold',
          },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="budget"
          options={{
            title: 'Budget',
            headerShown: true,
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="dollarsign.circle.fill" color={color} />,
            headerRight: () => (
              <TouchableOpacity onPress={openMenuModal} style={{ marginRight: 15 }}>
                <Ionicons 
                  name="ellipsis-vertical"
                  size={24} 
                  color={Colors[colorScheme ?? 'light'].tint} 
                />
              </TouchableOpacity>
            ),
          }}
        />
      </Tabs>
      <HeaderMenuModal
        visible={isMenuModalVisible}
        onClose={closeMenuModal}
        onNavigateManageCategories={navigateToManageCategories}
        onNavigateMonthlyAnalyzer={navigateToMonthlyAnalyzer}
      />
    </>
  );
}
