import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, onSnapshot, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// Student-facing attendance view: shows only Present and Absent days (calendar highlights + lists)
export default function StudentAttendanceScreen() {
  const navigation = useNavigation();

  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(true);
  const [hasJoinedClass, setHasJoinedClass] = useState(null);
  const [joinedClasses, setJoinedClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [requesting, setRequesting] = useState(false);

  // Load real attendance data from Firestore
  useEffect(() => {
    let unsub = () => {};
    const checkJoinedAndLoadAttendance = async (user) => {
      if (!user || !db) {
        setHasJoinedClass(false);
        setLoading(false);
        return;
      }

      try {
        // Check if student joined any classes
        const classesCol = collection(db, 'classes');
        const q = query(classesCol, where('students', 'array-contains', user.uid));
        const snap = await getDocs(q);
        
        if (snap.empty) {
          setHasJoinedClass(false);
          setAttendance({});
          setJoinedClasses([]);
          setLoading(false);
        } else {
          setHasJoinedClass(true);
          const classes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setJoinedClasses(classes);
          setSelectedClassId(classes[0]?.id || null);
          
          // Load attendance records for this student
          const attendanceCol = collection(db, 'attendance');
          const attendanceQuery = query(attendanceCol, where('studentId', '==', user.uid));
          
          // Subscribe to real-time updates
          const unsubAttendance = onSnapshot(
            attendanceQuery,
            (attendanceSnap) => {
              const attendanceData = {};
              attendanceSnap.forEach((doc) => {
                const data = doc.data();
                // Flatten attendance: { dateString: 'present'|'absent'|'late' }
                if (data.date && data.status) {
                  attendanceData[data.date] = data.status;
                }
              });
              setAttendance(attendanceData);
              setLoading(false);
            },
            (err) => {
              console.error('Error loading attendance:', err);
              if (err.code === 'permission-denied') {
                Alert.alert('Permission', 'Unable to load attendance records. Check Firestore rules.');
              }
              setLoading(false);
            }
          );
          
          unsub = unsubAttendance;
        }
      } catch (err) {
        console.error('Error checking joined classes:', err);
        setHasJoinedClass(false);
        setLoading(false);
      }
    };

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      checkJoinedAndLoadAttendance(user);
    });

    return () => {
      unsubAuth();
      unsub();
    };
  }, []);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);

  // subscribe to aggregated attendance for selected class and today's date
  useEffect(() => {
    if (!selectedClassId || !db) return;
    let unsubAgg = () => {};
    try {
      const todayKey = formatDateKey(new Date());
      const aggDocId = `${selectedClassId}_${todayKey}`;
      const aggRef = doc(db, 'attendance', aggDocId);
      unsubAgg = onSnapshot(aggRef, (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const attendanceMap = data.attendance || {};
        const myStatus = attendanceMap[auth?.currentUser?.uid];
        if (myStatus) {
          setAttendance(prev => ({ ...prev, [todayKey]: myStatus }));
        }
      }, (err) => {
        console.error('Error listening aggregated attendance (student):', err);
      });
    } catch (err) {
      console.error('Failed subscribe aggregated attendance (student):', err);
    }

    return () => {
      try { unsubAgg(); } catch (e) {}
    };
  }, [selectedClassId]);

  // Keep attendance up to date with selected month
  useEffect(() => {
    const monthKey = selectedMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    console.log('Selected month:', monthKey);
  }, [selectedMonth]);

  const formatDateKey = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatDisplayDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const requestAttendance = async () => {
    if (!selectedClassId || !auth.currentUser) {
      Alert.alert('Error', 'Please select a class first');
      return;
    }

    setRequesting(true);
    try {
      const attendanceCol = collection(db, 'attendance');
      const today = formatDateKey(new Date());
      
      await addDoc(attendanceCol, {
        classId: selectedClassId,
        studentId: auth.currentUser.uid,
        studentName: auth.currentUser.displayName || 'Student',
        date: today,
        status: 'request',
        requestedAt: serverTimestamp(),
      });
      
      Alert.alert('Success', 'Attendance request submitted. Waiting for instructor approval.');
    } catch (err) {
      console.error('Error requesting attendance:', err);
      Alert.alert('Error', 'Failed to submit attendance request');
    } finally {
      setRequesting(false);
    }
  };

  const presentDates = useMemo(() => Object.keys(attendance).filter(k => attendance[k] === 'present'), [attendance]);
  const absentDates = useMemo(() => Object.keys(attendance).filter(k => attendance[k] === 'absent'), [attendance]);

  // Calendar helper: generate days for the selected month
  const getMonthDays = (d) => {
    const year = d.getFullYear();
    const month = d.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 1; i <= last.getDate(); i++) days.push(new Date(year, month, i));
    return { days, firstWeekday: first.getDay(), year, month };
  };

  const monthData = useMemo(() => getMonthDays(selectedMonth), [selectedMonth]);

  const renderDay = (day) => {
    const key = formatDateKey(day);
    const status = attendance[key];
    const isToday = key === formatDateKey(new Date());
    if (!status) {
      return (
        <View style={styles.dayCellEmpty} key={key}>
          <Text style={[styles.dayMuted, isToday && { fontWeight: 'bold', color: '#E75C1A' }]}>{day.getDate()}</Text>
        </View>
      );
    }
    const isPresent = status === 'present';
    return (
      <TouchableOpacity key={key} style={[
        styles.dayCell,
        isPresent ? styles.present : styles.absent,
        isToday && { borderWidth: 2, borderColor: '#E75C1A' }
      ]}>
        <Text style={styles.dayText}>{day.getDate()}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>My Attendance</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading attendance records...</Text>
          </View>
        ) : hasJoinedClass === false ? (
          <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <Text style={{ fontSize: 18, color: '#666', textAlign: 'center', marginBottom: 12 }}>
              you didnt join any class yet
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('PATHclass')} style={{ backgroundColor: '#E75C1A', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Join a class in PATHclass</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{flex:1}}>
            {/* Class selector and request button */}
            <View style={styles.classSelectContainer}>
              <TouchableOpacity onPress={() => setShowClassPicker(true)} style={styles.classSelectButton}>
                <Text style={styles.classSelectLabel}>Select Class:</Text>
                <Text style={styles.classSelectValue}>
                  {joinedClasses.find(c => c.id === selectedClassId)?.name || 'Select a class'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={requestAttendance} 
                disabled={requesting}
                style={[styles.requestButton, requesting && styles.requestButtonDisabled]}
              >
                <Text style={styles.requestButtonText}>{requesting ? 'Requesting...' : 'Request Attendance'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.calendarCard}>
              <View style={styles.calendarHeaderRow}>
                  <Text style={styles.calendarTitleText}>{selectedMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</Text>
                  <TouchableOpacity onPress={() => setShowCalendar(true)} style={styles.openCalBtn}><Text style={styles.openCalText}>Open</Text></TouchableOpacity>
                </View>

                <View style={styles.weekdaysRow}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(w => <Text key={w} style={styles.weekday}>{w}</Text>)}
                </View>

                <View style={styles.daysGrid}>
            {Array.from({ length: monthData.firstWeekday }).map((_, i) => <View style={styles.dayCellEmpty} key={`e${i}`} />)}
            {monthData.days.map(d => renderDay(d))}
                </View>
              </View>

              <View style={styles.listsRow}>
          <View style={styles.listCard}>
            <Text style={styles.listTitle}>Present</Text>
            <ScrollView>
              {presentDates.length === 0 && <Text style={styles.emptyText}>No present records</Text>}
              {presentDates.map(dk => (
                <Text key={dk} style={styles.listItem}>{formatDisplayDate(dk)}</Text>
              ))}
            </ScrollView>
          </View>
          <View style={styles.listCard}>
            <Text style={styles.listTitle}>Absent</Text>
            <ScrollView>
              {absentDates.length === 0 && <Text style={styles.emptyText}>No absent records</Text>}
              {absentDates.map(dk => (
                <Text key={dk} style={[styles.listItem, styles.absentText]}>{formatDisplayDate(dk)}</Text>
              ))}
            </ScrollView>
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 }}>
          <Text style={{ color: '#4CAF50', fontWeight: 'bold' }}>Present: {presentDates.length}</Text>
          <Text style={{ color: '#E53935', fontWeight: 'bold' }}>Absent: {absentDates.length}</Text>
        </View>
            </View>
        )}
      </View>

      <Modal visible={showCalendar} transparent animationType="fade" onRequestClose={() => setShowCalendar(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModal}>
            <View style={styles.calendarModalHeader}>
              <TouchableOpacity onPress={() => { const prev = new Date(selectedMonth); prev.setMonth(prev.getMonth() - 1); setSelectedMonth(prev); }}><Text style={styles.calNav}>‹</Text></TouchableOpacity>
              <Text style={styles.calendarModalTitle}>{selectedMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</Text>
              <TouchableOpacity onPress={() => { const next = new Date(selectedMonth); next.setMonth(next.getMonth() + 1); setSelectedMonth(next); }}><Text style={styles.calNav}>›</Text></TouchableOpacity>
            </View>

            <View style={styles.calendarDaysScroll}>
              <View style={styles.weekdaysRow}>
                {['Su','Mo','Tu','We','Th','Fr','Sa'].map(w => <Text key={w} style={styles.weekday}>{w}</Text>)}
              </View>
              <ScrollView>
                <View style={styles.daysGrid}>
                  {Array.from({ length: monthData.firstWeekday }).map((_, i) => <View style={styles.dayCellEmpty} key={`em${i}`} />)}
                  {monthData.days.map(d => {
                    const key = formatDateKey(d);
                    const s = attendance[key];
                    if (!s) return <View style={styles.dayCellMuted} key={key}><Text style={styles.dayMuted}>{d.getDate()}</Text></View>;
                    return <View key={key} style={[styles.dayCellSmall, s === 'present' ? styles.present : styles.absent]}><Text style={styles.dayTextSmall}>{d.getDate()}</Text></View>;
                  })}
                </View>
              </ScrollView>
            </View>

            <View style={styles.calendarModalFooter}><TouchableOpacity onPress={() => setShowCalendar(false)}><Text style={styles.closeCalText}>Close</Text></TouchableOpacity></View>
          </View>
        </View>
      </Modal>

      <Modal visible={showClassPicker} transparent animationType="fade" onRequestClose={() => setShowClassPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.classPickerModal}>
            <Text style={styles.classPickerTitle}>Select a Class</Text>
            <ScrollView style={styles.classPickerList}>
              {joinedClasses.map((cls) => (
                <TouchableOpacity
                  key={cls.id}
                  style={[styles.classPickerItem, selectedClassId === cls.id && styles.classPickerItemSelected]}
                  onPress={() => {
                    setSelectedClassId(cls.id);
                    setShowClassPicker(false);
                  }}
                >
                  <Text style={[styles.classPickerItemText, selectedClassId === cls.id && styles.classPickerItemTextSelected]}>
                    {cls.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setShowClassPicker(false)} style={styles.classPickerClose}>
              <Text style={styles.closeCalText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#E75C1A',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  backButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  backButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    width: 30,
    height: 22,
    textAlign: 'center',
    color: '#fff',
    marginTop: -10,
  },
  title: {
    fontSize: 24,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: 1,
    marginTop: 6,	
    marginLeft: 10,
  },

  content: { padding: 16, flex: 1 },
  calendarCard: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12, backgroundColor: '#fff' },
  calendarHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  calendarTitleText: { fontSize: 16, fontWeight: '700' },
  openCalBtn: { padding: 6, backgroundColor: '#f8f8f8', borderRadius: 6 },
  openCalText: { color: '#333' },

  weekdaysRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 6, marginBottom: 6 },
  weekday: { width: 40, textAlign: 'center', color: '#666' },

  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: 40, height: 36, justifyContent: 'center', alignItems: 'center', margin: 2, borderRadius: 6 },
  dayCellEmpty: { width: 40, height: 36, justifyContent: 'center', alignItems: 'center', margin: 2 },
  dayCellMuted: { width: 40, height: 36, justifyContent: 'center', alignItems: 'center', margin: 2, opacity: 0.4 },
  dayText: { color: '#fff', fontWeight: '700' },
  dayTextSmall: { color: '#fff', fontSize: 12 },
  dayMuted: { color: '#999' },

  present: { backgroundColor: '#4CAF50' },
  absent: { backgroundColor: '#E53935' },

  listsRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  listCard: { flex: 1, borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 10, minHeight: 140 },
  listTitle: { fontWeight: '700', marginBottom: 8 },
  listItem: { paddingVertical: 6, color: '#333' },
  absentText: { color: '#E53935' },
  emptyText: { color: '#666' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#666', fontSize: 16 },
  calendarModal: { width: 340, backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden' },
  calendarModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  calendarModalTitle: { fontWeight: '700' },
  calNav: { fontSize: 22, paddingHorizontal: 8 },
  calendarDaysScroll: { maxHeight: 300 },
  dayCellSmall: { width: 36, height: 32, justifyContent: 'center', alignItems: 'center', margin: 2, borderRadius: 6 },
  calendarModalFooter: { padding: 12, alignItems: 'flex-end' },
  closeCalText: { color: '#E75C1A', fontWeight: '700' },

  classSelectContainer: { flexDirection: 'row', padding: 12, gap: 8, marginBottom: 12, alignItems: 'center' },
  classSelectButton: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  classSelectLabel: { fontSize: 12, color: '#666', marginRight: 6 },
  classSelectValue: { fontSize: 14, fontWeight: '600', color: '#333', flex: 1 },
  requestButton: { backgroundColor: '#E75C1A', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  requestButtonDisabled: { opacity: 0.6 },
  requestButtonText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  classPickerModal: { width: 300, backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden', maxHeight: 400 },
  classPickerTitle: { fontSize: 16, fontWeight: '700', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  classPickerList: { maxHeight: 250 },
  classPickerItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  classPickerItemSelected: { backgroundColor: '#E75C1A' },
  classPickerItemText: { fontSize: 14, color: '#333' },
  classPickerItemTextSelected: { color: '#fff', fontWeight: '600' },
  classPickerClose: { padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eee' },
});
