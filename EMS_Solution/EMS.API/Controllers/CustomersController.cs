using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using EMS.Data.Data;
using EMS.Data.Models;
using EMS.Shared.DTOs;

namespace EMS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CustomersController : ControllerBase
{
    private readonly EmsDbContext _context;

    public CustomersController(EmsDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<CustomerDto>>> GetCustomers()
    {
        var customers = await _context.Customers.ToListAsync();
        var customerDtos = customers.Select(c => new CustomerDto
        {
            CustomerID = c.CustomerID,
            Category = c.Category,
            CompanyName = c.CompanyName,
            Address1 = c.Address1,
            Address2 = c.Address2,
            Rating = c.Rating,
            Type = c.Type,
            FaxNo = c.FaxNo,
            Phone1 = c.Phone1,
            Phone2 = c.Phone2,
            MailId = c.MailId,
            Website = c.Website,
            Status = c.Status
        });
        return Ok(customerDtos);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<CustomerDto>> GetCustomer(int id)
    {
        var customer = await _context.Customers.FindAsync(id);
        if (customer == null)
            return NotFound();

        var customerDto = new CustomerDto
        {
            CustomerID = customer.CustomerID,
            Category = customer.Category,
            CompanyName = customer.CompanyName,
            Address1 = customer.Address1,
            Address2 = customer.Address2,
            Rating = customer.Rating,
            Type = customer.Type,
            FaxNo = customer.FaxNo,
            Phone1 = customer.Phone1,
            Phone2 = customer.Phone2,
            MailId = customer.MailId,
            Website = customer.Website,
            Status = customer.Status
        };
        return Ok(customerDto);
    }

    [HttpPost]
    public async Task<ActionResult<CustomerDto>> CreateCustomer(CustomerDto customerDto)
    {
        var customer = new Customer
        {
            Category = customerDto.Category,
            CompanyName = customerDto.CompanyName,
            Address1 = customerDto.Address1,
            Address2 = customerDto.Address2,
            Rating = customerDto.Rating,
            Type = customerDto.Type,
            FaxNo = customerDto.FaxNo,
            Phone1 = customerDto.Phone1,
            Phone2 = customerDto.Phone2,
            MailId = customerDto.MailId,
            Website = customerDto.Website,
            Status = customerDto.Status
        };

        _context.Customers.Add(customer);
        await _context.SaveChangesAsync();

        customerDto.CustomerID = customer.CustomerID;
        return CreatedAtAction(nameof(GetCustomer), new { id = customer.CustomerID }, customerDto);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateCustomer(int id, CustomerDto customerDto)
    {
        if (id != customerDto.CustomerID)
            return BadRequest();

        var customer = await _context.Customers.FindAsync(id);
        if (customer == null)
            return NotFound();

        customer.Category = customerDto.Category;
        customer.CompanyName = customerDto.CompanyName;
        customer.Address1 = customerDto.Address1;
        customer.Address2 = customerDto.Address2;
        customer.Rating = customerDto.Rating;
        customer.Type = customerDto.Type;
        customer.FaxNo = customerDto.FaxNo;
        customer.Phone1 = customerDto.Phone1;
        customer.Phone2 = customerDto.Phone2;
        customer.MailId = customerDto.MailId;
        customer.Website = customerDto.Website;
        customer.Status = customerDto.Status;

        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteCustomer(int id)
    {
        var customer = await _context.Customers.FindAsync(id);
        if (customer == null)
            return NotFound();

        _context.Customers.Remove(customer);
        await _context.SaveChangesAsync();
        return NoContent();
    }
}
