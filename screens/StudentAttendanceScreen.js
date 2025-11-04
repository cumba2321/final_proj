import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

// Student-facing attendance view: shows only Present and Absent days (calendar highlights + lists)
export default function StudentAttendanceScreen() {
  const navigation = useNavigation();

  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(true);

  // Fetch student's attendance records
  useEffect(() => {
    const fetchAttendance = async () => {
      if (!auth.currentUser || !db) return;

      try {
        // Get all attendance records where this student appears
        const attendanceQuery = query(
          collection(db, 'attendance'),
          where(`attendance.${auth.currentUser.uid}`, 'in', ['present', 'absent'])
        );
        
        const snapshot = await getDocs(attendanceQuery);
        
        // Transform into date -> status map
        const records = {};
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.date && data.attendance && data.attendance[auth.currentUser.uid]) {
            records[data.date] = data.attendance[auth.currentUser.uid];
          }
        });

        setAttendance(records);
      } catch (error) {
        console.error('Error fetching attendance:', error);
        Alert.alert('Error', 'Failed to load attendance records');
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
  }, []);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    // Placeholder: if you have Firestore data, fetch student's attendance here
    // Example: query attendance docs for this student and transform into date->status map
  }, []);

  const formatDateKey = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
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
    if (!status) {
      // The requirement: students only see the days they are present or absent.
      // We will render an empty (muted) cell for unmarked days.
      return (
        <View style={styles.dayCellEmpty} key={key}><Text style={styles.dayMuted}>{day.getDate()}</Text></View>
      );
    }

    const isPresent = status === 'present';
    return (
      <TouchableOpacity key={key} style={[styles.dayCell, isPresent ? styles.present : styles.absent]}>
        <Text style={styles.dayText}>{day.getDate()}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
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
        ) : (
            <View>
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
                <Text key={dk} style={styles.listItem}>{dk}</Text>
              ))}
            </ScrollView>
          </View>

          <View style={styles.listCard}>
            <Text style={styles.listTitle}>Absent</Text>
            <ScrollView>
              {absentDates.length === 0 && <Text style={styles.emptyText}>No absent records</Text>}
              {absentDates.map(dk => (
                <Text key={dk} style={[styles.listItem, styles.absentText]}>{dk}</Text>
              ))}
            </ScrollView>
          </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 40, paddingBottom: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  backButton: { padding: 8 },
  backIcon: { fontSize: 24, color: '#333' },
  headerTitleContainer: { flex: 1, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#E75C1A' },

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
  closeCalText: { color: '#E75C1A', fontWeight: '700' }
});
