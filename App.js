import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

import WelcomeScreen from './screens/WelcomeScreen';
import LoginScreen from './screens/LoginScreen';
import SignUpScreen from './screens/SignUpScreen';
import HomeScreen from './screens/HomeScreen';
import ClassworkScreen from './screens/ClassworkScreen';
import PeopleScreen from './screens/PeopleScreen';
import InstructorFeedbackScreen from './screens/InstructorFeedbackScreen';
import CampusAnnouncementScreen from './screens/CampusAnnouncementScreen';
import SectionAnnouncementScreen from './screens/SectionAnnouncementScreen';
import ClassWallScreen from './screens/ClassWallScreen';
import ProgressScreen from './screens/ProgressScreen';
import { StatusBar } from 'expo-status-bar';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Classwork" component={ClassworkScreen} />
      <Tab.Screen name="People" component={PeopleScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

    return unsubscribe;
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="MainTabs" component={MainTabs} />
        ) : (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
          </>
        )}
        <Stack.Screen name="InstructorFeedback" component={InstructorFeedbackScreen} />
        <Stack.Screen name="CampusAnnouncement" component={CampusAnnouncementScreen} />
        <Stack.Screen name="SectionAnnouncement" component={SectionAnnouncementScreen} />
        <Stack.Screen name="ClassWall" component={ClassWallScreen} />
        <Stack.Screen name="Progress" component={ProgressScreen} />
      </Stack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
