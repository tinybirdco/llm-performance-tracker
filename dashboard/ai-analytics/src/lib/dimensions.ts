// Only Tinybird API hosts (plus localhost outside production) to avoid SSRF via caller-supplied URLs
export const isAllowedTinybirdApiUrl = (apiUrl: string | null) => {
  if (!apiUrl) return false;
  if (/^https:\/\/api\.([a-z0-9-]+\.)*tinybird\.co\/?$/.test(apiUrl)) return true;
  return process.env.NODE_ENV !== 'production' && /^http:\/\/localhost(:\d+)?\/?$/.test(apiUrl);
};

export const fetchAvailableDimensions = async (token: string | null, apiUrl: string | null) => {
  if (!token) {
    console.error('No Tinybird token available');
    return null;
  }

  if (!isAllowedTinybirdApiUrl(apiUrl)) {
    console.error('Invalid Tinybird API URL');
    return null;
  }

  try {
    const url = `${apiUrl}/v0/pipes/llm_dimensions.json`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Error fetching dimensions:', error);
      throw new Error('Network response was not ok');
    }
    
    const data = await response.json();
    console.log('Available dimensions:', data);
    return data;
  } catch (error) {
    console.error('Error fetching dimensions:', error);
    return null;
  }
}; 