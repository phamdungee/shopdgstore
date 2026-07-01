const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleToken(token, isAccessToken = false) {
  let email, name, picture;
  if (!isAccessToken) {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new Error('Invalid Google ID Token');
    }
    email = payload.email.toLowerCase();
    name = payload.name || payload.given_name || email.split('@')[0];
    picture = payload.picture;
  } else {
    const response = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${token}`);
    if (!response.ok) {
      throw new Error('Invalid Google Access Token');
    }
    const payload = await response.json();
    email = payload.email.toLowerCase();
    name = payload.name || payload.given_name || email.split('@')[0];
    picture = payload.picture;
  }
  return { email, name, picture };
}

module.exports = { verifyGoogleToken };
