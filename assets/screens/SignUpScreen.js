import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('student');
  const navigation = useNavigation();

  const handleSignUp = async () => {
    // Validate password confirmation
    if (password !== confirmPassword) {
      alert('Passwords do not match. Please try again.');
      return;
    }

    // Validate password length
    if (password.length < 6) {
      alert('Password should be at least 6 characters long.');
      return;
    }

    try {
      const userCredentials = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredentials.user;
      
      // Save user role to Firestore
      if (db) {
        await setDoc(doc(db, 'users', user.uid), {
          email: user.email,
          role: selectedRole,
          createdAt: new Date().toISOString()
        });
      }
      
      console.log('Signed up with:', user.email, 'as', selectedRole);
      navigation.navigate('Login');
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign Up</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        keyboardType="email-address"
        value={email}
        onChangeText={text => setEmail(text)}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={text => setPassword(text)}
      />

      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        secureTextEntry
        value={confirmPassword}
        onChangeText={text => setConfirmPassword(text)}
      />

      {/* Role Selection */}
      <Text style={styles.roleLabel}>Choose your account type:</Text>
      <View style={styles.roleContainer}>
        <TouchableOpacity 
          style={[styles.roleButton, selectedRole === 'student' && styles.selectedRole]}
          onPress={() => setSelectedRole('student')}
        >
          <Text style={[styles.roleText, selectedRole === 'student' && styles.selectedRoleText]}>
            🎓 Student
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.roleButton, selectedRole === 'instructor' && styles.selectedRole]}
          onPress={() => setSelectedRole('instructor')}
        >
          <Text style={[styles.roleText, selectedRole === 'instructor' && styles.selectedRoleText]}>
            👨‍🏫 Instructor
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleSignUp}>
        <Text style={styles.buttonText}>Join for free</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#E75C1A',
    marginBottom: 32,
  },
  input: {
    width: '100%',
    height: 48,
    borderColor: '#E75C1A',
    borderWidth: 1,
    borderRadius: 6,
    marginBottom: 16,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#E75C1A',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  roleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    alignSelf: 'flex-start',
    width: '100%',
  },
  roleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 24,
    gap: 12,
  },
  roleButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
  },
  selectedRole: {
    borderColor: '#E75C1A',
    backgroundColor: '#FFF3EF',
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  selectedRoleText: {
    color: '#E75C1A',
  },
});
