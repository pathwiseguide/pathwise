# Setting Up a Custom Domain for Pathwise

## Step 1: Buy a Domain

### Recommended Domain Registrars:
1. **Namecheap** (Recommended - Easy to use, good prices)
   - https://www.namecheap.com
   - ~$10-15/year for .com domains
   - Free privacy protection

2. **Google Domains** (Now Squarespace Domains)
   - https://domains.squarespace.com
   - Simple interface
   - ~$12/year for .com

3. **Cloudflare** (Cheapest, but more technical)
   - https://www.cloudflare.com/products/registrar/
   - At-cost pricing (~$8-10/year)
   - Best for advanced users

4. **GoDaddy** (Popular but more expensive)
   - https://www.godaddy.com
   - Easy to use
   - ~$12-15/year

### What to Look For:
- **Domain name**: Choose something like `pathwise.com`, `pathwiseguide.com`, `getpathwise.com`
- **Extension**: `.com` is best, but `.io`, `.co`, `.app` also work
- **Privacy protection**: Usually free or $1-2/year (hides your personal info)

## Step 2: Connect Domain to Render

### In Render Dashboard:

1. **Go to your service** (the web service you created)

2. **Click "Settings"** in the left sidebar

3. **Scroll to "Custom Domains"** section

4. **Click "Add Custom Domain"**

5. **Enter your domain** (e.g., `pathwise.com` or `www.pathwise.com`)

6. **Render will show you DNS records** to add:
   - Usually a CNAME record pointing to your Render URL
   - Or an A record with an IP address

## Step 3: Configure DNS at Your Domain Registrar

### For Namecheap (Example):

1. **Log into Namecheap**
2. **Go to Domain List** → Click "Manage" next to your domain
3. **Go to "Advanced DNS" tab**
4. **Add the DNS records Render provided:**

   **Option A: CNAME (Recommended)**
   - Type: `CNAME Record`
   - Host: `@` (for root domain) or `www` (for www subdomain)
   - Value: Your Render URL (e.g., `pathwise.onrender.com`)
   - TTL: Automatic

   **Option B: A Record (If Render provides IP)**
   - Type: `A Record`
   - Host: `@`
   - Value: IP address from Render
   - TTL: Automatic

5. **Save changes**

### For Other Registrars:
- Process is similar - look for "DNS Settings" or "DNS Management"
- Add the CNAME or A record that Render provides

## Step 4: SSL Certificate (Automatic)

- **Render automatically provides SSL certificates** (HTTPS)
- Takes 5-60 minutes after DNS is configured
- Your site will be accessible at `https://yourdomain.com`

## Step 5: Wait for DNS Propagation

- **DNS changes take 1-48 hours** to propagate worldwide
- Usually works within 1-2 hours
- You can check status in Render dashboard

## Step 6: Test Your Domain

1. **Wait for SSL certificate** (check Render dashboard)
2. **Visit your domain** in browser
3. **Should redirect to HTTPS automatically**

## Common Issues:

### Domain Not Working?
- Check DNS records are correct
- Wait longer (DNS can take up to 48 hours)
- Check Render dashboard for errors
- Verify SSL certificate is issued

### Want Both www and non-www?
- Add both `@` and `www` as CNAME records
- Or set up redirect in Render settings

## Cost Summary:

- **Domain**: ~$10-15/year
- **Render hosting**: Free (or paid if you upgrade)
- **SSL certificate**: Free (included with Render)
- **Total**: ~$10-15/year for domain only

## Important Notes:

⚠️ **Buying a domain does NOT solve the data persistence issue**
- You still need to back up data or use a database
- Domain is just for a custom URL

✅ **Benefits of custom domain:**
- Professional appearance
- Better branding
- Easier to remember
- Better for SEO

