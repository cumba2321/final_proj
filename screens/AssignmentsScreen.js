import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Modal, Image, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';

// Import Firebase with error handling
let db = null;
let auth = null;
try {
  const firebase = require('../firebase');
  db = firebase.db;
  auth = firebase.auth;
} catch (error) {
  console.log('Firebase not available:', error);
}

export default function AssignmentsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { classInfo, userRole: passedUserRole } = route.params || {};
  
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(passedUserRole || null);
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Create Assignment Modal State
  const [newAssignment, setNewAssignment] = useState({
    title: '',
    description: '',
    dueDate: '',
    points: '',
    instructions: '',
    links: [],
    attachedFiles: [],
    attachedImages: []
  });

  // Initialize assignments collection reference for the specific class
  const assignmentsCollectionRef = db && classInfo ? collection(db, 'classes', classInfo.id, 'assignments') : null;

  // Fetch user role from Firestore
  const fetchUserRole = async (user) => {
    if (user && db) {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setUserRole(userDoc.data().role);
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
      }
    }
  };

  const getAssignments = async () => {
    if (!assignmentsCollectionRef || !classInfo) {
      console.log('Firebase not initialized or no class selected, using empty assignments');
      setAssignments([]);
      return;
    }

    try {
      const data = await getDocs(assignmentsCollectionRef);
      const assignmentsData = data.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
      
      // Sort assignments by due date (earliest first)
      assignmentsData.sort((a, b) => {
        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate) - new Date(b.dueDate);
        }
        return 0;
      });
      
      setAssignments(assignmentsData);
    } catch (error) {
      console.error("Error fetching assignments: ", error);
      setAssignments([]);
    }
  };

  useEffect(() => {
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        if (user) {
          fetchUserRole(user);
        } else {
          setUserRole(null);
        }
      });
      
      return unsubscribe;
    }
  }, []);

  useEffect(() => {
    getAssignments();
    requestImagePermissions();
  }, []);

  const requestImagePermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to add images!');
    }
  };

  const pickImage = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled) {
        setNewAssignment(prev => ({
          ...prev,
          attachedImages: [...prev.attachedImages, result.assets[0]]
        }));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const pickDocument = async () => {
    try {
      let result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        setNewAssignment(prev => ({
          ...prev,
          attachedFiles: [...prev.attachedFiles, ...result.assets]
        }));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const addLink = () => {
    Alert.prompt(
      'Add Link',
      'Enter the URL you want to attach:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: (url) => {
            if (url && url.trim()) {
              setNewAssignment(prev => ({
                ...prev,
                links: [...prev.links, { url: url.trim(), title: url.trim() }]
              }));
            }
          }
        }
      ],
      'plain-text',
      '',
      'url'
    );
  };

  const removeImage = (index) => {
    setNewAssignment(prev => ({
      ...prev,
      attachedImages: prev.attachedImages.filter((_, i) => i !== index)
    }));
  };

  const removeFile = (index) => {
    setNewAssignment(prev => ({
      ...prev,
      attachedFiles: prev.attachedFiles.filter((_, i) => i !== index)
    }));
  };

  const removeLink = (index) => {
    setNewAssignment(prev => ({
      ...prev,
      links: prev.links.filter((_, i) => i !== index)
    }));
  };

  const getFileIcon = (fileName) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf': return '📄';
      case 'doc':
      case 'docx': return '📝';
      case 'xls':
      case 'xlsx': return '📊';
      case 'ppt':
      case 'pptx': return '📺';
      case 'txt': return '📋';
      case 'zip':
      case 'rar': return '🗂️';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif': return '🖼️';
      default: return '📎';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleCreateAssignment = async () => {
    if (!newAssignment.title.trim() || !newAssignment.dueDate) {
      Alert.alert('Error', 'Please fill in title and due date');
      return;
    }

    setIsLoading(true);
    
    if (!assignmentsCollectionRef) {
      console.log('Firebase not available, assignment creation failed');
      Alert.alert('Error', 'Unable to create assignment. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      const assignmentData = {
        title: newAssignment.title.trim(),
        description: newAssignment.description.trim(),
        instructions: newAssignment.instructions.trim(),
        dueDate: newAssignment.dueDate,
        points: parseInt(newAssignment.points) || 100,
        createdAt: new Date(),
        createdBy: currentUser?.uid,
        createdByName: currentUser?.displayName || currentUser?.email || 'Instructor',
        classId: classInfo?.id,
        className: classInfo?.name,
        submissions: [],
        status: 'active',
        attachedFiles: newAssignment.attachedFiles,
        attachedImages: newAssignment.attachedImages,
        links: newAssignment.links
      };

      await addDoc(assignmentsCollectionRef, assignmentData);
      
      // Reset form
      setNewAssignment({
        title: '',
        description: '',
        dueDate: '',
        points: '',
        instructions: '',
        links: [],
        attachedFiles: [],
        attachedImages: []
      });
      setSelectedDate(new Date());
      
      setShowCreateModal(false);
      getAssignments(); // Refresh the list
      Alert.alert('Success', 'Assignment created successfully!');
    } catch (error) {
      console.error("Error creating assignment: ", error);
      Alert.alert('Error', 'Failed to create assignment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    if (!db || !assignmentId) return;

    Alert.alert(
      'Delete Assignment',
      'Are you sure you want to delete this assignment? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'classes', classInfo.id, 'assignments', assignmentId));
              getAssignments(); // Refresh the list
              Alert.alert('Success', 'Assignment deleted successfully');
            } catch (error) {
              console.error('Error deleting assignment:', error);
              Alert.alert('Error', 'Failed to delete assignment');
            }
          }
        }
      ]
    );
  };

  // Date picker functions
  const handleDateChange = (event, date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    
    if (date) {
      setSelectedDate(date);
      const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
      setNewAssignment({...newAssignment, dueDate: formattedDate});
    }
  };

  const showDatePickerModal = () => {
    setShowDatePicker(true);
  };

  const formatDisplayDate = (dateString) => {
    if (!dateString) return 'Select due date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const isOverdue = (dueDate) => {
    return new Date(dueDate) < new Date();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>Assignments</Text>
          <Text style={styles.subtitle}>{classInfo?.name || 'Class Assignments'}</Text>
        </View>
        {userRole === 'instructor' && (
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setShowCreateModal(true)}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content}>
        {assignments.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📝</Text>
            <Text style={styles.emptyStateTitle}>No assignments yet</Text>
            <Text style={styles.emptyStateText}>
              {userRole === 'instructor' 
                ? 'Create your first assignment to get started!'
                : 'Your instructor hasn\'t posted any assignments yet.'
              }
            </Text>
          </View>
        ) : (
          assignments.map((assignment) => (
            <View key={assignment.id} style={styles.assignmentCard}>
              <View style={styles.assignmentHeader}>
                <View style={styles.assignmentTitleRow}>
                  <Text style={styles.assignmentTitle}>{assignment.title}</Text>
                  <Text style={styles.assignmentPoints}>{assignment.points} pts</Text>
                </View>
                <View style={styles.assignmentMetaRow}>
                  <Text style={[
                    styles.assignmentDueDate,
                    isOverdue(assignment.dueDate) && styles.overdue
                  ]}>
                    Due: {formatDate(assignment.dueDate)}
                    {isOverdue(assignment.dueDate) && ' (Overdue)'}
                  </Text>
                  {userRole === 'instructor' && (
                    <TouchableOpacity 
                      style={styles.deleteButton}
                      onPress={() => handleDeleteAssignment(assignment.id)}
                    >
                      <Text style={styles.deleteButtonText}>🗑️</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              
              {assignment.description && (
                <Text style={styles.assignmentDescription}>{assignment.description}</Text>
              )}
              
              {assignment.instructions && (
                <View style={styles.instructionsSection}>
                  <Text style={styles.instructionsLabel}>Instructions:</Text>
                  <Text style={styles.instructionsText}>{assignment.instructions}</Text>
                </View>
              )}

              {/* Attachments Display */}
              {(assignment.attachedImages?.length > 0 || assignment.attachedFiles?.length > 0 || assignment.links?.length > 0) && (
                <View style={styles.attachmentsSection}>
                  <Text style={styles.attachmentsLabel}>Attachments:</Text>
                  
                  {/* Images */}
                  {assignment.attachedImages?.map((image, index) => (
                    <View key={`img-${index}`} style={styles.attachmentItem}>
                      <Image source={{ uri: image.uri }} style={styles.attachmentImage} />
                      <Text style={styles.attachmentName} numberOfLines={1}>
                        {image.fileName || `Image ${index + 1}`}
                      </Text>
                    </View>
                  ))}
                  
                  {/* Files */}
                  {assignment.attachedFiles?.map((file, index) => (
                    <TouchableOpacity key={`file-${index}`} style={styles.attachmentItem}>
                      <Text style={styles.attachmentIcon}>{getFileIcon(file.name)}</Text>
                      <View style={styles.attachmentInfo}>
                        <Text style={styles.attachmentName} numberOfLines={1}>{file.name}</Text>
                        <Text style={styles.attachmentSize}>{formatFileSize(file.size)}</Text>
                      </View>
                      <Text style={styles.downloadIcon}>⬇️</Text>
                    </TouchableOpacity>
                  ))}
                  
                  {/* Links */}
                  {assignment.links?.map((link, index) => (
                    <TouchableOpacity key={`link-${index}`} style={styles.attachmentItem}>
                      <Text style={styles.attachmentIcon}>🔗</Text>
                      <View style={styles.attachmentInfo}>
                        <Text style={styles.attachmentName} numberOfLines={1}>{link.title}</Text>
                        <Text style={styles.linkUrl} numberOfLines={1}>{link.url}</Text>
                      </View>
                      <Text style={styles.externalIcon}>↗️</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              
              <View style={styles.assignmentActions}>
                {userRole === 'student' ? (
                  <TouchableOpacity style={styles.submitButton}>
                    <Text style={styles.submitButtonText}>Submit Assignment</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.viewSubmissionsButton}>
                    <Text style={styles.viewSubmissionsButtonText}>
                      View Submissions ({assignment.submissions?.length || 0})
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Create Assignment Modal */}
      <Modal visible={showCreateModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Assignment</Text>
              <TouchableOpacity onPress={() => {
                setShowCreateModal(false);
                setSelectedDate(new Date());
                setNewAssignment({
                  title: '',
                  description: '',
                  dueDate: '',
                  points: '',
                  instructions: '',
                  links: [],
                  attachedFiles: [],
                  attachedImages: []
                });
              }}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Assignment Title *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter assignment title"
                  value={newAssignment.title}
                  onChangeText={(text) => setNewAssignment({...newAssignment, title: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Brief description of the assignment"
                  multiline
                  numberOfLines={3}
                  value={newAssignment.description}
                  onChangeText={(text) => setNewAssignment({...newAssignment, description: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Instructions</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Detailed instructions for students"
                  multiline
                  numberOfLines={4}
                  value={newAssignment.instructions}
                  onChangeText={(text) => setNewAssignment({...newAssignment, instructions: text})}
                />
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.inputLabel}>Due Date *</Text>
                  <TouchableOpacity
                    style={[styles.textInput, styles.datePickerButton]}
                    onPress={showDatePickerModal}
                  >
                    <Text style={[
                      styles.datePickerText,
                      !newAssignment.dueDate && styles.placeholderText
                    ]}>
                      {formatDisplayDate(newAssignment.dueDate)}
                    </Text>
                    <Text style={styles.calendarIcon}>📅</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.inputLabel}>Points</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="100"
                    keyboardType="numeric"
                    value={newAssignment.points}
                    onChangeText={(text) => setNewAssignment({...newAssignment, points: text})}
                  />
                </View>
              </View>

              {/* Attachments Section */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Attachments</Text>
                
                {/* Attachment Buttons */}
                <View style={styles.attachmentButtons}>
                  <TouchableOpacity style={styles.attachmentButton} onPress={pickImage}>
                    <Text style={styles.attachmentButtonIcon}>🖼️</Text>
                    <Text style={styles.attachmentButtonText}>Images</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.attachmentButton} onPress={pickDocument}>
                    <Text style={styles.attachmentButtonIcon}>📎</Text>
                    <Text style={styles.attachmentButtonText}>Files</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.attachmentButton} onPress={addLink}>
                    <Text style={styles.attachmentButtonIcon}>🔗</Text>
                    <Text style={styles.attachmentButtonText}>Links</Text>
                  </TouchableOpacity>
                </View>

                {/* Attached Images Preview */}
                {newAssignment.attachedImages.length > 0 && (
                  <View style={styles.attachedItemsContainer}>
                    <Text style={styles.attachedItemsLabel}>Attached Images:</Text>
                    {newAssignment.attachedImages.map((image, index) => (
                      <View key={index} style={styles.attachedItem}>
                        <Image source={{ uri: image.uri }} style={styles.previewImage} />
                        <View style={styles.attachedItemInfo}>
                          <Text style={styles.attachedItemName}>
                            {image.fileName || `Image ${index + 1}`}
                          </Text>
                        </View>
                        <TouchableOpacity 
                          style={styles.removeButton}
                          onPress={() => removeImage(index)}
                        >
                          <Text style={styles.removeButtonText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Attached Files Preview */}
                {newAssignment.attachedFiles.length > 0 && (
                  <View style={styles.attachedItemsContainer}>
                    <Text style={styles.attachedItemsLabel}>Attached Files:</Text>
                    {newAssignment.attachedFiles.map((file, index) => (
                      <View key={index} style={styles.attachedItem}>
                        <Text style={styles.attachedFileIcon}>{getFileIcon(file.name)}</Text>
                        <View style={styles.attachedItemInfo}>
                          <Text style={styles.attachedItemName} numberOfLines={1}>
                            {file.name}
                          </Text>
                          <Text style={styles.attachedItemSize}>
                            {formatFileSize(file.size)}
                          </Text>
                        </View>
                        <TouchableOpacity 
                          style={styles.removeButton}
                          onPress={() => removeFile(index)}
                        >
                          <Text style={styles.removeButtonText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Attached Links Preview */}
                {newAssignment.links.length > 0 && (
                  <View style={styles.attachedItemsContainer}>
                    <Text style={styles.attachedItemsLabel}>Attached Links:</Text>
                    {newAssignment.links.map((link, index) => (
                      <View key={index} style={styles.attachedItem}>
                        <Text style={styles.attachedFileIcon}>🔗</Text>
                        <View style={styles.attachedItemInfo}>
                          <Text style={styles.attachedItemName} numberOfLines={1}>
                            {link.title}
                          </Text>
                          <Text style={styles.attachedItemSize} numberOfLines={1}>
                            {link.url}
                          </Text>
                        </View>
                        <TouchableOpacity 
                          style={styles.removeButton}
                          onPress={() => removeLink(index)}
                        >
                          <Text style={styles.removeButtonText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => {
                  setShowCreateModal(false);
                  setSelectedDate(new Date());
                  setNewAssignment({
                    title: '',
                    description: '',
                    dueDate: '',
                    points: '',
                    instructions: '',
                    links: [],
                    attachedFiles: [],
                    attachedImages: []
                  });
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.createButton, isLoading && styles.createButtonDisabled]}
                onPress={handleCreateAssignment}
                disabled={isLoading}
              >
                <Text style={styles.createButtonText}>
                  {isLoading ? 'Creating...' : 'Create Assignment'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 16,
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  backButton: {
    padding: 8,
  },
  backIcon: {
    fontSize: 24,
    color: '#333',
    fontWeight: 'bold',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E75C1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  assignmentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  assignmentHeader: {
    marginBottom: 12,
  },
  assignmentTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  assignmentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  assignmentPoints: {
    fontSize: 14,
    color: '#E75C1A',
    fontWeight: 'bold',
    marginLeft: 12,
  },
  assignmentMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  assignmentDueDate: {
    fontSize: 14,
    color: '#666',
  },
  overdue: {
    color: '#f44336',
    fontWeight: 'bold',
  },
  deleteButton: {
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 16,
  },
  assignmentDescription: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 12,
  },
  instructionsSection: {
    marginBottom: 12,
  },
  instructionsLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  instructionsText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 18,
  },
  assignmentActions: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  viewSubmissionsButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  viewSubmissionsButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: '80%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalCloseButton: {
    fontSize: 20,
    color: '#666',
    padding: 4,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    maxHeight: 400,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 12,
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: 'bold',
    fontSize: 14,
  },
  createButton: {
    backgroundColor: '#E75C1A',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  createButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  
  // Attachments Styles
  attachmentsSection: {
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  attachmentsLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  attachmentImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginRight: 12,
    resizeMode: 'cover',
  },
  attachmentIcon: {
    fontSize: 20,
    marginRight: 12,
    textAlign: 'center',
    width: 24,
  },
  attachmentInfo: {
    flex: 1,
  },
  attachmentName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    marginBottom: 2,
  },
  attachmentSize: {
    fontSize: 12,
    color: '#666',
  },
  linkUrl: {
    fontSize: 12,
    color: '#4A90E2',
    fontStyle: 'italic',
  },
  downloadIcon: {
    fontSize: 14,
    marginLeft: 8,
  },
  externalIcon: {
    fontSize: 14,
    marginLeft: 8,
  },
  
  // Attachment Modal Styles
  attachmentButtons: {
    flexDirection: 'row',
    marginBottom: 16,
    justifyContent: 'space-around',
  },
  attachmentButton: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f0f2f5',
    borderRadius: 8,
    minWidth: 80,
  },
  attachmentButtonIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  attachmentButtonText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  attachedItemsContainer: {
    marginTop: 12,
  },
  attachedItemsLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 8,
  },
  attachedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  previewImage: {
    width: 32,
    height: 32,
    borderRadius: 4,
    marginRight: 10,
    resizeMode: 'cover',
  },
  attachedFileIcon: {
    fontSize: 16,
    marginRight: 10,
    textAlign: 'center',
    width: 20,
  },
  attachedItemInfo: {
    flex: 1,
  },
  attachedItemName: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
    marginBottom: 2,
  },
  attachedItemSize: {
    fontSize: 10,
    color: '#666',
  },
  removeButton: {
    padding: 4,
    marginLeft: 8,
  },
  removeButtonText: {
    fontSize: 12,
    color: '#f44336',
    fontWeight: 'bold',
  },
  datePickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  datePickerText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  placeholderText: {
    color: '#999',
  },
  calendarIcon: {
    fontSize: 16,
    marginLeft: 8,
  },
});