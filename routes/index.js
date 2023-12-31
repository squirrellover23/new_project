var express = require('express');
const {db} = require('../database');
const {send_email} = require('../email_control')

var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
    db.all("SELECT * FROM classes WHERE registered = 0", (err, openClasses) => {
        if(err){
            res.status(500).send('Error Getting Classes');
        } else {
            db.all("SELECT * FROM classes WHERE registered = 1", (err, closedClasses) => {
                if(err){
                    res.status(500).send('Error Getting Classes');
                } else {
                    res.render('login-settings', {closedClasses: closedClasses, openClasses: openClasses});
                }
            });
        }
    })
});



router.post('/addnewuser', (req, res) => {
    const { firstName, lastName } = req.body;

    if (!firstName ||!lastName) {
        res.json({success: false, message: `Please Enter a Vaild Name` });
        return;
    }
    // Check if the user already exists in the database
    db.get("SELECT * FROM names WHERE firstName = ? AND lastName = ?", [firstName, lastName], (err, row) => {
        if (err) {
            res.status(500).send('Error checking user existence.');
        } else if (row) {
            res.json({success: false, message: `Failed to add: ${firstName} ${lastName}. User already exists.` });
        } else {
            // User doesn't exist, insert into the database
            db.run("INSERT INTO names (firstName, lastName) VALUES (?, ?)", [firstName, lastName], (err) => {
                if (err) {
                    res.status(500).send('Error adding the new user.');
                } else {
                    res.json({success: true, message: `${firstName} ${lastName} added succesfully` });
                }
            });
        }
    });
});


router.get('/adduser', (req, res) => {
    res.render('adduser');
});


router.get('/viewusers', (req, res) => {
    db.all("SELECT firstName, lastName, visits_since_vouch FROM names", (err, rows) => {
        if (err) {
            res.status(500).send('Error fetching user data.');
        } else {
            const sort_rows = rows.sort((a, b) => {
                const nameA = a.lastName.toUpperCase(); // Convert names to uppercase for case-insensitive comparison
                const nameB = b.lastName.toUpperCase();
              
                if (nameA < nameB) {
                    return -1;
                } else if (nameA > nameB) {
                    return 1;
                } else {
                    const nameA2 = a.firstName.toUpperCase(); // Convert names to uppercase for case-insensitive comparison
                    const nameB2 = b.firstName.toUpperCase();
                    if (nameA2 < nameB2) {
                        return -1;
                    } else if (nameA2 > nameB2) {
                        return 1;
                    } else {
                        return 0
                    }
                }
                // names must be equal
                
              });
            res.render('viewusers', { users: sort_rows});
        }
    });
});



router.get('/classes', (req, res) => {
    db.all('SELECT * FROM classes WHERE registered = 1', (err, registeredClasses) => {
        if (err) {
            res.status(500).send('Internal Server Error');
            return;
        }

        // Fetch unregistered classes from the database
        db.all('SELECT * FROM classes WHERE registered = 0', (err, unregisteredClasses) => {
            if (err) {
                res.status(500).send('Internal Server Error');
                return;
            }

            // Render the EJS template with registered and unregistered classes
            res.render('classes', { registeredClasses, unregisteredClasses });
        });
    });
});

// Route to handle the form submission and add a new class
router.post('/add-class', (req, res) => {
    const className = req.body.className;
    const registered = req.body.registered === 'true'; // Convert string to boolean

    // Check if the class already exists
    db.get('SELECT * FROM classes WHERE className = ?', [className], (err, existingClass) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Internal Server Error');
            return;
        }

        // If the class already exists, redirect back to the class list page
        if (existingClass) {
            res.redirect('/classes');
        } else {
            // Insert the new class into the database
            const query = 'INSERT INTO classes (className, registered) VALUES (?, ?)';
            db.run(query, [className, registered], (err) => {
                if (err) {
                    console.error(err.message);
                    res.status(500).send('Internal Server Error');
                    return;
                }

                // Redirect back to the class list page after adding the class
                res.redirect('/classes');
            });
        }
    });
});


function update_visits(visits_to_update) {
    return (req, res) => {
        const { firstName, lastName, visits } = req.body;
        const referringPage = req.get('referer');
    
        if (!visits){
            res.redirect(referringPage || '/viewusers');
            return;
        }
        db.run(`UPDATE names SET ${visits_to_update} = ? WHERE firstName = ? AND lastName = ?`, [visits, firstName, lastName], (err) => {
            if (err) {
                res.status(500).send('Error updating the visit count.');
            } else {
                res.redirect(referringPage || '/viewusers'); // Redirect back to the "View Users" page
            }
        });
    }
}

router.post('/update-vouch-visits', update_visits('visits_since_vouch'));
router.post('/update-open-visits', update_visits('open_class_visits'));
router.post('/update-closed-visits', update_visits('enrolled_class_visits'));

router.post('/update-vouch-open-visits', (req, res) => {
    const { firstName, lastName, visits, originalValue } = req.body;
    const referringPage = req.get('referer');
    const diff = Number(visits) - Number(originalValue)
    if (!visits){
        res.redirect(referringPage || '/viewusers');
        return;
    }
    db.run(`UPDATE names SET visits_since_vouch = visits_since_vouch + ?, open_class_visits = open_class_visits + ?  WHERE firstName = ? AND lastName = ?`, [diff, diff, firstName, lastName], (err) => {
        if (err) {
            res.status(500).send('Error updating the visit count.');
        } else {
            res.redirect(referringPage || '/viewusers'); // Redirect back to the "View Users" page
        }
    });
})



router.post('/givevoucher', (req, res) => {
    const { firstName, lastName } = req.body;
    const updateQuery = `UPDATE names SET visits_since_vouch = CASE WHEN (visits_since_vouch - 16) < 0 THEN 0 ELSE visits_since_vouch - 16 END, vouchers_received = vouchers_received + 1 WHERE firstName = ? AND lastName = ?;`;
    const referringPage = req.get('referer');
    db.run(updateQuery, [firstName, lastName], (err) => {
        if (err) {
            res.status(500).send('Error updating the visit count.');
        } else {
            const currentDate = new Date().toISOString();
            db.run("INSERT INTO vouchers_given (firstName, lastName, time_given) VALUES (?, ?, ?)", [firstName, lastName, currentDate], (err) => {
                if (err){
                    res.status(500).send('Error logging voucher info.');
                } else {
                    res.redirect(referringPage || '/viewusers');
                }
            });
        }
    });
});


router.get('/user/:firstName/:lastName', (req, res) => {
    const { firstName, lastName } = req.params;
  
    // Query the database to get user information
    const query = "SELECT * FROM names WHERE firstName = ? AND lastName = ?";
    db.get(query, [firstName, lastName], (err, userRow) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Internal Server Error');
        } else if (userRow) {
            const loginQuery = 'SELECT login_time, class FROM login_logs WHERE firstName = ? AND lastName = ?';
            db.all(loginQuery, [firstName, lastName], (err, loginRows) => {
                if (err) {
                    console.error(err.message);
                    res.status(500).send('Internal Server Error');
                } else {
                    const voucherQuery = 'SELECT time_given FROM vouchers_given WHERE firstName = ? AND lastName = ?';
                    db.all(voucherQuery, [firstName, lastName], (err, voucherRows) => {
                        if (err) {
                        console.error(err.message);
                        res.status(500).send('Internal Server Error');
                        return;
                        }

                        // Render the EJS template with user, login, and voucher information
                        res.render('userinfo', { user: userRow, logins: loginRows, vouchers: voucherRows });
                    });
                }
            });
        } else {
            // User not found
            res.status(404).send('User not found');
        }
    });
});


router.post('/deleteuser', (req, res) => {
    const { firstName, lastName } = req.body;
    db.run("DELETE FROM names WHERE firstName = ? AND lastName = ?", [firstName, lastName], (err) => {
        if (err) {
            res.status(500).send('Error deleting the user.');
        } else {
            db.run("DELETE FROM login_logs WHERE firstName = ? AND lastName = ?", [firstName, lastName], (err) => {
                if (err) {
                    res.status(500).send('Error deleting the user.');
                } else {
                    res.redirect('/viewusers'); // Redirect back to the "View Users" page
                }
            });
            
        }
    });
});

router.post('/deleteclass', (req, res) => {
    const { className } = req.body;
    db.run("DELETE FROM classes WHERE className = ?", [className], (err) => {
        if (err) {
            res.status(500).send('Error deleting the class.');
        } else {
            res.redirect('/classes');
        }
    });
});

router.post('/editclass', (req, res) => {
    const oldClassName = req.body.oldClassName;
    const newClassName = req.body.editClassName;

    // Update the class name in the database
    db.run('UPDATE classes SET className = ? WHERE className = ?', [newClassName, oldClassName], (err) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error Changing Class Name');
        } else {
            db.run('UPDATE login_logs SET class = ? WHERE class = ?', [newClassName, oldClassName], (err) => {
                if (err) {
                    console.error(err);
                    res.status(500).send('Error Changing Class Name');
                } else {
                    res.redirect('/classes'); // Redirect to the classes page
                }
            });
        }
    });
});


router.get('/login-attempts', (req, res) => {
    // Check if user_id, start date, and end date are provided in the query parameters
    const { user_id, user_class, startDate, endDate } = req.query;
    let query = 'SELECT * FROM login_logs WHERE 1=1'; // 1=1 for dynamic WHERE clause building
    const params = [];

    // If user_id is provided, filter by user_id
    if (user_id) {
      query += ' AND firstName = ? AND lastName = ?';
      params.push.apply(params, user_id.split(' '));
    }
    // If class is provided, filter by class
    if (user_class) {
        query += ' AND class = ?';
        params.push(user_class);
    }
  
    // If start and end dates are provided, filter by that date range
    if (startDate) {
        query += ` AND login_time >= ?`;
        params.push(startDate)
    }

    if (endDate) {
        // Adjust the endDate to be inclusive by adding one day
        const nextDay = new Date(endDate);
        nextDay.setDate(nextDay.getDate() + 1);
        query += ` AND login_time <= ?`;
        params.push(`${nextDay.toISOString()}`);
        console.log(nextDay.toISOString())
    }
  
    // Retrieve login attempts based on the query
    db.all(query, params, (err, rows) => {
        if (err) {  
            console.error('Error retrieving login attempts:', err.message);
            res.status(500).send('Internal Server Error');
        } else {
            db.all('SELECT * FROM classes', (err, result) => {
                if (err) {
                    res.status(500).send('Error fetching class data.');
                }
                res.render('login-attempts', { loginAttempts: rows, user_id, user_class, startDate, endDate, classes: result });
            });
            // Render the login attempts page and pass the login attempts data to the view
        }
    });
  });
  
  


module.exports = router;
