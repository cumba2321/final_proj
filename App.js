import React, { useState, useEffect } from 'react';
import { Image } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

import WelcomeScreen from './screens/WelcomeScreen';
import LoginScreen from './screens/LoginScreen';
import SignUpScreen from './screens/SignUpScreen';
import HomeScreen from './screens/HomeScreen';
import PeopleScreen from './screens/PeopleScreen';
import InstructorFeedbackScreen from './screens/InstructorFeedbackScreen';
import SectionAnnouncementScreen from './screens/SectionAnnouncementScreen';
import InstructorAttendanceScreen from './screens/InstructorAttendanceScreen';
import StudentAttendanceScreen from './screens/StudentAttendanceScreen';
import ClassWallScreen from './screens/ClassWallScreen';
import ClassDetailsScreen from './screens/ClassDetailsScreen';
import AssignmentsScreen from './screens/AssignmentsScreen';
import GradesScreen from './screens/GradesScreen';
import MyProfileScreen from './screens/MyProfileScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import PATHclassScreen from './screens/PATHclassScreen';
import ManageStudentsScreen from './screens/ManageStudentsScreen';
import { StatusBar } from 'expo-status-bar';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true, // show text label below icons
        tabBarActiveTintColor: '#E75C1A', // active text color (orange)
        tabBarInactiveTintColor: '#cbcbcb',  // inactive text color (gray)
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 0,
          elevation: 5,
          height: 75,
        },
        
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <Image
              source={
                focused
                  ? require('./assets/HA.png')  // active icon
                  : require('./assets/HN.png') // inactive icon
              }
              style={{
                width: 24,
                height: 24,
              }}
            />
          ),
          
        }}
      />

      <Tab.Screen
        name="People"
        component={PeopleScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <Image
              source={
                focused
                  ? require('./assets/PA.png')
                  : require('./assets/PN.png')
              }
              style={{
                width: 24,
                height: 24,
              }}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}


export default function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  if (isLoading) {
    return null; // or a loading screen
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen 
              name="MainTabs" 
              component={MainTabs} 
              options={{ headerShown: false }}
            />
            <Stack.Screen name="PATHclass" component={PATHclassScreen} />
            <Stack.Screen name="ClassDetails" component={ClassDetailsScreen} />
            <Stack.Screen name="Assignments" component={AssignmentsScreen} />
            <Stack.Screen name="Grades" component={GradesScreen} />
            <Stack.Screen name="InstructorFeedback" component={InstructorFeedbackScreen} />
            <Stack.Screen name="SectionAnnouncement" component={SectionAnnouncementScreen} />
            <Stack.Screen name="ClassWall" component={ClassWallScreen} />
            <Stack.Screen name="MyProfile" component={MyProfileScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="ManageStudents" component={ManageStudentsScreen} />
            <Stack.Screen name="InstructorAttendance" component={InstructorAttendanceScreen} />
            <Stack.Screen name="StudentAttendance" component={StudentAttendanceScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
          </>
        )}
      </Stack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
