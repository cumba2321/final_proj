import React from 'react';
import { View, Text, ImageBackground, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function WelcomeScreen() {
  const navigation = useNavigation();
  return (
    <ImageBackground
      source={require('../assets/splash-icon.png')}
      style={styles.background}
      imageStyle={{ opacity: 1 }}
    >
      <View style={styles.overlay} />
      <View style={styles.container}>
        <Image
        source={require('../assets/PATHwhite.png')}
        style={styles.logo}
        resizeMode='contain'
        accessibilityLabel="PATHFIT logo" />

        <TouchableOpacity
          style={styles.joinButton}
          onPress={() => navigation.navigate('SignUp')}
        >
          <Text style={styles.joinText}>Join for free</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.loginText}>Log In</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E75C1A',
    opacity: 0.90,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    width: 500,     
    height: 400,     
    resizeMode: 'contain', 
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 80,
    letterSpacing: 2,
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  joinButton: {
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  joinText: {
    color: '#042175',
    fontWeight: 'bold',
    fontSize: 18,
  },
  loginText: {
    color: '#fff',
    fontSize: 19,
    fontWeight: 'bold',
    opacity: 1,
  },
});
