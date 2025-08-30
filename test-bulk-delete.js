const fs = require('fs');

// Read vector IDs from file
const vectorIds = JSON.parse(fs.readFileSync('vector-ids.json', 'utf-8'));

// Create proper request body
const requestBody = {
  ids: vectorIds
};

// Send request to bulk delete endpoint
fetch('http://localhost:8787/api/vectors/bulk-delete', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(requestBody)
})
.then(response => response.json())
.then(data => {
  console.log('Bulk delete result:');
  console.log(JSON.stringify(data, null, 2));
})
.catch(error => {
  console.error('Error:', error);
});