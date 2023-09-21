const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

// (API 1) Register User API
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUser = `SELECT username FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(checkUser);
  console.log(dbUser);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `INSERT INTO user(name, username, password, gender)
            Values ('${name}', '${username}', '${hashedPassword}', '${gender}');`;
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

// (API 2) User Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUser = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(checkUser);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "secret_key");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// Authenticate jwt Token (middleware function)
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secret_key", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// (API 3) Get tweets of people whom the user follows. Return 4 tweets at a time
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await db.get(getUserQuery);
  console.log(getUserId);

  const getFollowerIdsQuery = `SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${getUserId.user_id};`;
  const getFollowerIds = await db.all(getFollowerIdsQuery);
  console.log(getFollowerIds);

  const getFollowerIdsSample = getFollowerIds.map((eachUser) => {
    return eachUser.following_user_id;
  });
  // console.log(getFollowerIdsSample);

  const getTweetsQuery = `SELECT user.username, tweet.tweet, tweet.date_time AS dateTime
    FROM user JOIN tweet ON user.user_id = tweet.user_id
    WHERE user.user_id IN (${getFollowerIdsSample})
    ORDER BY tweet.date_time DESC LIMIT 4;`;
  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

// (API 4) Get the list of all names of people whom the user follows
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
  const getUserId = await db.get(getUserQuery);
  console.log(getUserId);

  const getFollowerIdsQuery = `SELECT following_user_id FROM follower
    WHERE follower_user_id = ${getUserId.user_id};`;
  const getFollowerIdsArray = await db.all(getFollowerIdsQuery);
  const getFollowerIds = getFollowerIdsArray.map((eachUser) => {
    return eachUser.following_user_id;
  });
  const getFollowersResultQuery = `SELECT name FROM user WHERE user_id IN (${getFollowerIds})`;
  const followingResult = await db.all(getFollowersResultQuery);
  response.send(followingResult);
});

// (API 5) Get the list of all names of people who follows the user
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await db.get(getUserIdQuery);

  const getFollowerIdsQuery = `
    SELECT follower_user_id FROM follower WHERE following_user_id = ${getUserId.user_id};`;
  const followerIdsArray = await db.all(getFollowerIdsQuery);
  console.log(followerIdsArray);
  const getFollowerIds = followerIdsArray.map((eachUser) => {
    return eachUser.follower_user_id;
  });
  console.log(`${getFollowerIds}`);

  const getFollowerNameQuery = `SELECT name FROM user WHERE user_id IN (${getFollowerIds})`;
  const followerName = await db.all(getFollowerNameQuery);
  response.send(followerName);
});

// (API 6) Get the tweet, likes count, replies count and date-time
const getTweetsDescription = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetData.date_time,
  };
};

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);

  const getFollowingIdsQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id = ${userId.user_id};`;
  const followingIdsArray = await db.all(getFollowingIdsQuery);

  const getFollowingIds = followingIdsArray.map((eachFollower) => {
    return eachFollower.following_user_id;
  });
  console.log(getFollowingIds);
  const getTweetsIdsQuery = `
    SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowingIds})`;
  const tweetIdsArray = await db.all(getTweetsIdsQuery);
  const followingTweetIds = tweetIdsArray.map((eachId) => {
    return eachId.tweet_id;
  });

  if (followingTweetIds.includes(parseInt(tweetId))) {
    const likesCountQuery = `
      SELECT COUNT(user_id) AS likes FROM like WHERE tweet_id = ${tweetId};`;
    const likesCount = await db.get(likesCountQuery);

    const replyCountQuery = `
      SELECT COUNT(user_id) AS replies FROM reply WHERE tweet_id = ${tweetId};`;
    const replyCount = await db.get(replyCountQuery);

    const tweetTweetDateQuery = `
      SELECT tweet, date_time FROM tweet WHERE tweet_id = ${tweetId};`;
    const tweetTweetDate = await db.get(tweetTweetDateQuery);

    response.send(getTweetsDescription(tweetTweetDate, likesCount, replyCount));
  } else {
    response.status(401);
    response.send("Invalid Request");
    console.log("Invalid Request");
  }
});

// (API 7) Get the list of usernames who liked the tweet
const convertLikedUsernameDbObjectToResponseObejct = (dbObject) => {
  return {
    likes: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
    const userId = await db.get(getUserIdQuery);

    const getFollowingIdsQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id = ${userId.user_id};`;
    const followingIdsArray = await db.all(getFollowingIdsQuery);

    const getFollowingIds = followingIdsArray.map((eachFollower) => {
      return eachFollower.following_user_id;
    });
    console.log(getFollowingIds);
    const getTweetsIdsQuery = `
    SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowingIds})`;
    const tweetIdsArray = await db.all(getTweetsIdsQuery);
    const followingTweetIds = tweetIdsArray.map((eachId) => {
      return eachId.tweet_id;
    });

    if (followingTweetIds.includes(parseInt(tweetId))) {
      const getLikedUsernameQuery = `
      SELECT user.username AS likes FROM user INNER JOIN like ON
      user.user_id = like.user_id WHERE like.tweet_id = ${tweetId};`;
      const likedUsernamesArray = await db.all(getLikedUsernameQuery);
      const likedUsername = likedUsernamesArray.map((eachUser) => {
        return eachUser.likes;
      });

      response.send(
        convertLikedUsernameDbObjectToResponseObejct(likedUsername)
      );
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// (API 8) Get the list of replies on a tweet
const convertUsernameReplyDbObjectToResponseObject = (dbObject) => {
  return {
    replies: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
    const userId = await db.get(getUserIdQuery);

    const getFollowingIdsQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id = ${userId.user_id};`;
    const followingIdsArray = await db.all(getFollowingIdsQuery);

    const getFollowingIds = followingIdsArray.map((eachFollower) => {
      return eachFollower.following_user_id;
    });
    console.log(getFollowingIds);
    const getTweetsIdsQuery = `
    SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowingIds});`;
    const tweetIdsArray = await db.all(getTweetsIdsQuery);
    const getTweetIds = tweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });

    if (getTweetIds.includes(parseInt(tweetId))) {
      const getUsernameReplyTweetsQuery = `
      SELECT user.name, reply.reply FROM user INNER JOIN reply ON
      user.user_id = reply.user_id WHERE reply.tweet_id = ${tweetId};`;
      const usernameReplyTweets = await db.all(getUsernameReplyTweetsQuery);

      response.send(
        convertUsernameReplyDbObjectToResponseObject(usernameReplyTweets)
      );
    } else {
      response.status(401);
      response.send("Invalid Request");
      // console.log("Invalid Request");
    }
  }
);

// (API 9) Get a list of all tweets of the user
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  console.log(userId);

  const getTweetsIdQuery = `
  SELECT 
    tweet.tweet AS tweet,
    COUNT(DISTINCT(like.like_id)) AS likes,
    COUNT(DISTINCT(reply.reply_id)) AS replies,
    tweet.date_time AS dateTime
  FROM 
    user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id
    INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
  WHERE 
    user.user_id = ${userId.user_id}
  GROUP BY
    tweet.tweet_id;`;
  const tweetDetails = await db.all(getTweetsIdQuery);
  response.send(tweetDetails);
});

// (API 10) Create a tweet in the tweet table
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserQuery);

  const { tweet } = request.body;
  const currentDate = new Date();
  console.log(currentDate.toISOString().replace("T", " "));

  const postTweetQuery = `INSERT INTO tweet(tweet, user_id, date_time) 
    VALUES ('${tweet}', ${userId.user_id}, '${currentDate}');`;
  const responseResult = await db.run(postTweetQuery);
  const tweetId = responseResult.lastID;
  response.send("Created a Tweet");
});

// (API 11) Delete a tweet
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
    const userId = await db.get(getUserIdQuery);

    const getUserTweetListQuery = `SELECT tweet_id FROM tweet WHERE user_id = ${userId.user_id};`;
    const userTweetListArray = await db.all(getUserTweetListQuery);
    const userTweetList = userTweetListArray.map((eachTweetId) => {
      return eachTweetId.tweet_id;
    });
    console.log(userTweetList);

    if (userTweetList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
