async function verifyGithubCode(code, redirectUri) {
  // Exchange code for access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      ...(redirectUri ? { redirect_uri: redirectUri } : {})
    })
  });

  if (!tokenRes.ok) {
    throw new Error('Failed to exchange GitHub authorization code');
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    throw new Error(tokenData.error_description || 'GitHub authorization failed');
  }

  // Fetch GitHub user profile
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'DG-Store-App'
    }
  });

  if (!userRes.ok) {
    throw new Error('Failed to fetch GitHub user profile');
  }

  const userData = await userRes.json();
  
  // If email is null/private, fetch emails
  let email = userData.email;
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'DG-Store-App'
      }
    });
    if (emailsRes.ok) {
      const emails = await emailsRes.json();
      const primaryEmail = emails.find(e => e.primary && e.verified);
      if (primaryEmail) {
        email = primaryEmail.email;
      }
    }
  }

  if (!email) {
    throw new Error('No verified email associated with this GitHub account');
  }

  return {
    email: email.toLowerCase(),
    name: userData.name || userData.login || email.split('@')[0],
    picture: userData.avatar_url
  };
}

module.exports = { verifyGithubCode };
