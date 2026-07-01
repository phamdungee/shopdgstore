async function verifyFacebookToken(accessToken) {
  const response = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${accessToken}`);
  if (!response.ok) {
    throw new Error('Invalid Facebook Access Token');
  }

  const payload = await response.json();
  if (!payload.email) {
    throw new Error('Email is required but not provided by Facebook account');
  }

  return {
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture && payload.picture.data ? payload.picture.data.url : null
  };
}

module.exports = { verifyFacebookToken };
