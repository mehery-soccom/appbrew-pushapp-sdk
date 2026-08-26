import React from 'react';
import { Text, View, StyleSheet } from 'react-native';

type BannerProps = {
  backgroundColor: string;
  headerText: string;
  subText: string;
  name?: string;
};

export const CustomBanner: React.FC<BannerProps> = ({
  backgroundColor,
  headerText,
  subText,
  name,
}) => (
  <View style={[styles.bannerContainer, { backgroundColor }]}>
    {name && <Text style={styles.name}>{name}</Text>}
    <Text style={styles.header}>{headerText}</Text>
    <Text style={styles.subText}>{subText}</Text>
  </View>
);

const styles = StyleSheet.create({
  bannerContainer: {
    width: '100%',
    padding: 20,
    borderRadius: 10,
    marginTop: 20,
    borderWidth: 2,
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'red',
  },
  subText: {
    fontSize: 14,
    color: 'red',
    marginTop: 5,
  },
  name: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ccc',
    marginBottom: 5,
  },
});
